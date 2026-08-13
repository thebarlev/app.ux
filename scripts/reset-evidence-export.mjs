#!/usr/bin/env node
/**
 * Stage 0 of the test-data reset: capture the evidence, before any command.
 *
 * READ ONLY. Every call is a select or a storage list. There is no insert, update,
 * delete or rpc anywhere in this file, and it must stay that way — it is the
 * artefact the accountant's approval rests on, and it has to be runnable at any
 * time without consequence.
 *
 * Deliberately scoped to EVERYTHING rather than to a candidate set: the deletion
 * scope is still under decision, and evidence gathered for the wrong scope is
 * evidence gathered twice. Capturing all 154 documents and all 12 companies means
 * the bundle stays valid whichever way the four open questions are answered.
 *
 * Usage:  node scripts/reset-evidence-export.mjs <output-directory>
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const OUT = process.argv[2];
if (!OUT) {
  console.error("usage: node scripts/reset-evidence-export.mjs <output-directory>");
  process.exit(1);
}

const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  if (!m) throw new Error(`${k} is not set`);
  return m[1].trim();
};

const db = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const chunk = (a, n) => {
  const out = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

fs.mkdirSync(OUT, { recursive: true });
const write = (name, data) => {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
  const rows = Array.isArray(data) ? data.length : Object.keys(data).length;
  console.log(`  ${name.padEnd(34)} ${String(rows).padStart(5)} rows/keys · ${fs.statSync(file).size} bytes`);
  return rows;
};

/** Every row of a table, as-is. `select *` on purpose: an empty column is evidence too. */
async function all(table) {
  const { data, error } = await db.from(table).select("*");
  if (error) return { error: error.message };
  return data;
}

/** Rows of `table` whose `col` is one of `ids`, in batches. */
async function byIds(table, col, ids) {
  const out = [];
  for (const part of chunk(ids, 100)) {
    const { data, error } = await db.from(table).select("*").in(col, part);
    if (error) return { error: error.message };
    out.push(...data);
  }
  return out;
}

console.log("Stage 0 — evidence export (READ ONLY)");
console.log(`output: ${OUT}\n`);

const counts = {};

// ── documents, and everything hanging off them ───────────────────────────────
const documents = await all("documents");
if (documents.error) throw new Error(`documents: ${documents.error}`);
counts.documents = write("documents.json", documents);
const ids = documents.map((d) => d.id);

for (const [table, col] of [
  ["document_line_items", "document_id"],
  ["document_events", "document_id"],
  ["document_links", "source_document_id"],
  ["auditor_invoice_documents", "document_id"],
  ["billing_documents", "document_id"],
  ["receipt_payments", "document_id"],
]) {
  const rows = await byIds(table, col, ids);
  if (rows.error) {
    console.log(`  ${table.padEnd(34)} SKIPPED — ${rows.error}`);
    counts[table] = null;
  } else {
    counts[table] = write(`${table}.json`, rows);
  }
}

// document_links again by the other column, since either side can point at a
// document being deleted.
const linksByTarget = await byIds("document_links", "target_document_id", ids);
if (!linksByTarget.error) counts["document_links_by_target"] = write("document_links_by_target.json", linksByTarget);

// ── billing_failures IN FULL ─────────────────────────────────────────────────
// Not filtered by document: its document_id is ON DELETE SET NULL, so the link is
// what a deletion silently destroys. The whole table is captured while the links
// still exist, which is what makes that loss recoverable on paper.
const billingFailures = await all("billing_failures");
if (!billingFailures.error) counts.billing_failures = write("billing_failures.json", billingFailures);

// ── the sequences, which must not move ───────────────────────────────────────
const sequences = await all("document_sequences");
if (sequences.error) throw new Error(`document_sequences: ${sequences.error}`);
counts.document_sequences = write("document_sequences.json", sequences);

// ── companies and the other tables a company deletion would cascade into ─────
for (const table of [
  "companies",
  "company_members",
  "customers",
  "recipient_consents",
  "billing_renewal_events",
  "auditor_subscription_charges",
  "auditor_subscriptions",
  "unlimited_document_companies",
  "system_admins",
]) {
  const rows = await all(table);
  if (rows.error) {
    console.log(`  ${table.padEnd(34)} SKIPPED — ${rows.error}`);
    counts[table] = null;
  } else {
    counts[table] = write(`${table}.json`, rows);
  }
}

// ── Storage: what exists per document, by id ─────────────────────────────────
// documents.pdf_storage_path is null on every row, so the row-to-object link is
// not recorded anywhere. The listing has to go by id, by convention.
const storage = [];
for (const d of documents) {
  const { data } = await db.storage.from("business-secure").list(`documents/${d.id}`, { limit: 50 });
  const files = (data || []).filter((x) => x.id).map((x) => ({ name: x.name, size: x.metadata?.size ?? null }));
  if (files.length) storage.push({ documentId: d.id, documentNumber: d.document_number, files });
}
counts.storage_objects = write("storage-documents.json", storage);

// ── the before-counts, as one file ───────────────────────────────────────────
write("counts-before.json", {
  capturedAt: new Date().toISOString(),
  counts,
  note:
    "Counts as they stood before any deletion. document_sequences must be identical " +
    "afterwards for the five Bogo Media rows; see the memo.",
});

console.log("\nsummary");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(34)} ${v === null ? "unavailable" : v}`);
console.log("\nREAD ONLY — nothing was modified.");
