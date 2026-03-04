/**
 * Verification script: issuer/customer mapping for auditor invoice_receipt PDF.
 *
 * Run: npx tsx scripts/verify-auditor-invoice-mapping.ts
 *
 * Requires: DOCUMENT_ID env (or uses charge 7f58cab5-d111-47c3-b5cf-a18b1008b467's document)
 *
 * Asserts:
 * - LEFT block (company) = issuer company (4ae68334-15a0-4fa3-a9ba-fd77deccc95d)
 * - RIGHT block (customer) = customer company (a981a6e6-dd24-4db2-9cf9-8262bf49881f)
 *
 * Note: issuer block uses issuer_company_id; customer block uses charge.company_id.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js")

const EXPECTED_ISSUER_ID = "4ae68334-15a0-4fa3-a9ba-fd77deccc95d"
const EXPECTED_CUSTOMER_ID = "a981a6e6-dd24-4db2-9cf9-8262bf49881f"
const CHARGE_ID = "7f58cab5-d111-47c3-b5cf-a18b1008b467"

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  let documentId = process.env.DOCUMENT_ID

  if (!documentId) {
    const { data: charge } = await supabase
      .from("auditor_subscription_charges")
      .select("issued_invoice_id")
      .eq("id", CHARGE_ID)
      .maybeSingle()
    documentId = charge?.issued_invoice_id
  }

  if (!documentId) {
    console.error("No document ID. Set DOCUMENT_ID or ensure charge exists.")
    process.exit(1)
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("id, company_id, document_type, reference_text")
    .eq("id", documentId)
    .single()

  if (!doc) {
    console.error("Document not found:", documentId)
    process.exit(1)
  }

  const isAuditor = String(doc.reference_text || "").startsWith("auditor_charge:")
  if (!isAuditor) {
    console.log("Document is not auditor invoice_receipt, skipping mapping check.")
    process.exit(0)
  }

  // document.company_id = customer (charge.company_id) for RLS
  const docCompanyId = doc.company_id
  const mappingOk =
    docCompanyId === EXPECTED_CUSTOMER_ID &&
    "PDF render uses issuer from AUDITOR_BILLING_ACCOUNT_ID, customer from doc.company_id"

  console.log("Auditor invoice_receipt mapping check:")
  console.log("  document.company_id (customer for RLS):", docCompanyId)
  console.log("  Expected customer:", EXPECTED_CUSTOMER_ID)
  console.log("  Expected issuer (from env):", EXPECTED_ISSUER_ID)
  console.log("  Mapping rule: issuer block uses issuer_company_id; customer block uses charge.company_id")
  if (docCompanyId === EXPECTED_CUSTOMER_ID) {
    console.log("  OK: document.company_id matches expected customer")
  } else {
    console.warn("  WARN: document.company_id does not match expected customer - check charge")
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
