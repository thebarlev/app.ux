import "server-only";

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertCompanyRoleAccess } from "@/lib/regulatory/bkmv/auth";
import {
  BkmvError,
  bkmvExportDirectory,
  bkmvPrimaryIdentifier,
  bkmvSummaryRecords,
  buildBkmvPackageZip,
  buildBkmvTxt,
  buildIniTxt,
} from "@/lib/regulatory/bkmv";
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
      .select(
        "id, document_type, document_number, issue_date, finalized_at, created_at, currency, " +
          "total_amount, subtotal, vat_amount, vat_rate, company_id, document_status, " +
          "customer_id, customer_name, customer_tax_id, customer_address, customer_phone, " +
          "customers(address_city, address_zip, address_country, customer_number)"
      )
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

    const documents: BkmvDocument[] = (docs || []).map((d: any) => {
      // `customers` is the joined row, present only when customer_id is set.
      const c = Array.isArray(d.customers) ? d.customers[0] : d.customers;
      return {
        id: d.id,
        documentType: d.document_type,
        documentNumber: d.document_number,
        issueDate: d.issue_date,
        finalizedAt: d.finalized_at ?? null,
        createdAt: d.created_at,
        documentStatus: d.document_status ?? null,
        currency: d.currency,
        totalAmount: d.total_amount,
        subtotal: d.subtotal ?? null,
        vatAmount: d.vat_amount ?? null,
        vatRate: d.vat_rate ?? null,
        customerName: d.customer_name ?? null,
        customerTaxId: d.customer_tax_id ?? null,
        customerAddress: d.customer_address ?? null,
        customerPhone: d.customer_phone ?? null,
        customerCity: c?.address_city ?? null,
        customerPostalCode: c?.address_zip ?? null,
        customerCountry: c?.address_country ?? null,
        customerNumber: c?.customer_number ?? null,
      };
    });

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
      .select(
        "document_id, line_number, description, quantity, unit_price, discount_amount, line_total, " +
          "currency, item_date, item_code, bank_name, branch, account_number, payment_metadata"
      )
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
      discountAmount: it.discount_amount ?? null,
      lineTotal: it.line_total,
      currency: it.currency,
      itemDate: it.item_date ?? null,
      itemCode: it.item_code ?? null,
      bankName: it.bank_name ?? null,
      branch: it.branch ?? null,
      accountNumber: it.account_number ?? null,
      paymentMetadata: it.payment_metadata ?? null,
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

    // One identifier per export, shared by A000 1004, A100 1103 and Z900 1153.
    const primaryIdentifier = bkmvPrimaryIdentifier();

    const { txtBuffer, stats, recordCounts, recordCount } = buildBkmvTxt({
      ctx,
      documents,
      lineItems,
      primaryIdentifier,
    });

    const directory = bkmvExportDirectory({ dealerNumber: companyTaxId, at: generatedAt });
    const { txtBuffer: iniBuffer } = buildIniTxt({
      primaryIdentifier,
      dealerNumber: companyTaxId,
      businessName: String(company.company_name || "").trim(),
      bkmvDataRecordCount: recordCount,
      summaries: bkmvSummaryRecords(recordCounts),
      range: { from, to },
      processStartedAt: generatedAt,
      filePath: directory,
    });

    const { zipBuffer } = await buildBkmvPackageZip({
      directory,
      iniTxt: iniBuffer,
      bkmvDataTxt: txtBuffer,
    });

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

