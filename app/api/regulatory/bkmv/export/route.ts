import "server-only";
import { assertNotTestCompany } from "@/lib/security/test-company-guard.server";

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertCompanyRoleAccess } from "@/lib/regulatory/bkmv/auth";
import { buildBkmvTxt, buildIncomeZip, BkmvError } from "@/lib/regulatory/bkmv";
import type { BkmvContext, BkmvDocument, BkmvLineItem } from "@/lib/regulatory/bkmv";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";

function format2(n: number) {
  return String(n).padStart(2, "0");
}

function toKeyParts(now: Date) {
  const yyyy = now.getUTCFullYear();
  const mm = format2(now.getUTCMonth() + 1);
  const dd = format2(now.getUTCDate());
  const hh = format2(now.getUTCHours());
  const mi = format2(now.getUTCMinutes());
  const ss = format2(now.getUTCSeconds());
  return { yyyy, mm, dd, hh, mi, ss };
}

function toDDMMYYYY(isoDate: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate.replace(/-/g, "");
  const [, y, mo, d] = m;
  return `${d}${mo}${y}`;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit({ key: `bkmv-export:${ip}`, limit: 10, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = await req.json().catch(() => null);
    const companyId = body?.companyId as string | undefined;
    const from = body?.from as string | undefined; // YYYY-MM-DD
    const to = body?.to as string | undefined; // YYYY-MM-DD

    if (!companyId || !from || !to) {
      return NextResponse.json(
        { error: "Missing required fields: companyId, from, to" },
        { status: 400 }
      );
    }

    // Role-gated (admin/accountant/owner)
    await assertCompanyRoleAccess({ companyId, allowedRoles: ["owner", "admin", "accountant"] });

    /*
     * The uniform file is a filing. A test company's documents must never appear in
     * one, and this refuses rather than filtering them out: a file that silently
     * omits rows is a file whose totals do not reconcile, which is harder to notice
     * and worse to explain than a request that failed.
     */
    await assertNotTestCompany(companyId, "bkmv_export");

    const service = createServiceRoleClient();

    // Company data for header fields
    const { data: company, error: companyError } = await service
      .from("companies")
      .select("id, company_name, tax_id, registration_number")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const companyTaxId =
      String((company as any).tax_id || "").trim() ||
      String((company as any).registration_number || "").trim() ||
      "";

    // Documents: FINAL only, any document type, within date range by issue_date
    const { data: docs, error: docsError } = await service
      .from("documents")
      .select("id, document_type, document_number, issue_date, created_at, currency, total_amount, company_id, document_status")
      .eq("company_id", companyId)
      .eq("document_status", "final")
      .gte("issue_date", from)
      .lte("issue_date", to)
      .order("issue_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (docsError) {
      console.error("[BKMV] docs query failed", docsError);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    const documents: BkmvDocument[] = (docs || []).map((d: any) => ({
      id: d.id,
      documentType: d.document_type,
      documentNumber: d.document_number,
      issueDate: d.issue_date,
      createdAt: d.created_at,
      currency: d.currency,
      totalAmount: d.total_amount,
    }));

    if (documents.length === 0) {
      return NextResponse.json(
        { error: "No FINAL documents found in the given date range", code: "NO_FINAL_DOCUMENTS" },
        { status: 400 }
      );
    }

    // Line items (best-effort; some doc types may have none)
    const docIds = documents.map((d) => d.id);
    const { data: items, error: itemsError } = await service
      .from("document_line_items")
      .select("document_id, line_number, description, quantity, unit_price, line_total, currency")
      .in("document_id", docIds)
      .order("document_id", { ascending: true })
      .order("line_number", { ascending: true });

    if (itemsError) {
      console.error("[BKMV] line items query failed", itemsError);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    const lineItems: BkmvLineItem[] = (items || []).map((it: any) => ({
      documentId: it.document_id,
      lineNumber: it.line_number,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unit_price,
      lineTotal: it.line_total,
      currency: it.currency,
    }));

    const generatedAt = new Date();
    const ctx: BkmvContext = {
      companyId,
      companyTaxId,
      companyName: String(company.company_name || "").trim(),
      from,
      to,
      generatedAtIso: generatedAt.toISOString(),
    };

    const { txtBuffer, stats } = buildBkmvTxt({ ctx, documents, lineItems });
    const zipBuffer = await buildIncomeZip({ bkmvDataTxt: txtBuffer });

    const { yyyy, mm, dd, hh, mi, ss } = toKeyParts(generatedAt);
    const fromDD = toDDMMYYYY(from);
    const toDD = toDDMMYYYY(to);
    const fileKey = `company_${companyId}/bkmv/${yyyy}/${mm}/bkmv_${fromDD}_${toDD}_${yyyy}${mm}${dd}_${hh}${mi}${ss}.zip`;

    const { error: uploadError } = await service.storage
      .from("regulatory-exports")
      .upload(fileKey, zipBuffer, {
        contentType: "application/zip",
        upsert: false,
      });

    if (uploadError) {
      console.error("[BKMV] upload failed", uploadError);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      storageKey: fileKey,
      bucket: "regulatory-exports",
      generatedAt: generatedAt.toISOString(),
      stats,
    });
  } catch (e: any) {
    if (e instanceof BkmvError) {
      const status = e.code === "BKMV_SPEC_INCOMPLETE" ? 501 : 400;
      // Do not leak internal diagnostic details to clients.
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }

    if (e?.message === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e?.message === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[BKMV] export failed:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

