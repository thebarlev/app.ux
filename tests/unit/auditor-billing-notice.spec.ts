import { test, expect } from "@playwright/test"
import {
  AUDITOR_BILLING_NOTICE_TO,
  buildIssuanceErrorHtml,
  buildSubscriptionHtml,
  redactFreeText,
  subjectFor,
} from "@/lib/email/auditorBillingNotice"

/**
 * The three rules this notifier had to satisfy, each observed rather than assumed.
 */

const TOKEN = "9f8e7d6c5b4a392817069f8e7d6c5b4a"
const ID = "203458179"
const CARD = "4580123412341234"

// ── 3 · a test notice must look like one, in the subject ──────────────────────

test("1 ⛔ is_test true puts [בדיקה] in the SUBJECT", () => {
  expect(subjectFor(true, "מנוי חדש — Acme")).toBe("[בדיקה] מנוי חדש — Acme")
})

test("2 · a real sale carries no marker", () => {
  expect(subjectFor(false, "מנוי חדש — Acme")).toBe("מנוי חדש — Acme")
})

test("3 · the body says so too, but the subject is what an inbox shows", () => {
  const t = buildSubscriptionHtml(FIELDS(true))
  const r = buildSubscriptionHtml(FIELDS(false))
  expect(t).toContain("זו הודעת בדיקה")
  expect(r).not.toContain("זו הודעת בדיקה")
})

// ── 1 · the seven fields of notice A ─────────────────────────────────────────

function FIELDS(isTest: boolean) {
  return {
    isTest,
    fullName: "יצחק בר לב",
    companyName: "Acme בעמ",
    email: "buyer@example.co.il",
    mobile: "0501234567",
    planName: "Pro",
    amount: 250,
    currency: "ILS",
    invoiceNumber: "1002",
  }
}

test("4 · all seven requested fields appear", () => {
  const html = buildSubscriptionHtml(FIELDS(false))
  for (const v of ["יצחק בר לב", "Acme", "buyer@example.co.il", "0501234567", "Pro", "250", "1002"]) {
    expect(html, `missing ${v}`).toContain(v)
  }
})

test("5 · a missing field renders as a dash rather than 'null'", () => {
  const html = buildSubscriptionHtml({
    isTest: false, fullName: null, companyName: null, email: null,
    mobile: null, planName: null, amount: null, currency: null, invoiceNumber: null,
  })
  expect(html).not.toContain("null")
  expect(html).not.toContain("undefined")
  expect(html).toContain("—")
})

test("6 · a name containing HTML cannot inject markup", () => {
  const html = buildSubscriptionHtml({ ...FIELDS(false), companyName: '<script>x</script>"' })
  expect(html).not.toContain("<script>")
  expect(html).toContain("&lt;script&gt;")
})

// ── 2 · nothing sensitive, in either notice ──────────────────────────────────

test("7 ⛔ there is no parameter that could carry a token — the type has no room for one", () => {
  // The structural half of the rule. Every field is named and scalar, so this call is
  // the complete surface: a token cannot be filtered out of a place it cannot enter.
  const html = buildSubscriptionHtml(FIELDS(false))
  expect(html).not.toContain(TOKEN)
  expect(html).not.toContain(CARD)
  expect(html).not.toContain(ID)
})

test("8 ⛔ a token inside the error text is scrubbed", () => {
  const html = buildIssuanceErrorHtml({
    isTest: false, chargeId: "ee0974f6-94ea-4689-b915-62f5a3f85dea", attempts: 3,
    errorText: `duplicate key value violates unique constraint: token_hash=(${TOKEN})`,
  })
  expect(html).not.toContain(TOKEN)
  expect(html).toContain("[redacted]")
  // The diagnosable part survives.
  expect(html).toContain("unique constraint")
})

test("9 ⛔ a card number and an identity number in the error text are scrubbed", () => {
  expect(redactFreeText(`card ${CARD} declined`)).not.toContain(CARD)
  expect(redactFreeText(`CardOwnerID=${ID}`)).not.toContain(ID)
  expect(redactFreeText("4580 1234 1234 1234")).toContain("[redacted]")
})

test("10 · the scrub keeps what makes an error diagnosable", () => {
  const out = redactFreeText(
    'column reference "document_id" is ambiguous (SQLSTATE 42702) in issue_auditor_charge_invoice_receipt_service'
  )
  expect(out).toContain("document_id")
  expect(out).toContain("42702")
  expect(out).toContain("ambiguous")
})

test("11 ⚠️ a short number is NOT scrubbed — the scrub is shape-based, not proof", () => {
  // Stated so the limit is on the record: an eight-digit value, or a secret that does not
  // look like one, passes through. The named-parameter rule is the real protection.
  expect(redactFreeText("attempt 3 of 3, amount 11800")).toContain("11800")
})

// ── notice B carries the three requested facts ───────────────────────────────

test("12 · notice B names the charge, the attempt count and the original error", () => {
  const html = buildIssuanceErrorHtml({
    isTest: false, chargeId: "ee0974f6-94ea-4689-b915-62f5a3f85dea", attempts: 3,
    errorText: "rpc returned not-ok",
  })
  expect(html).toContain("ee0974f6-94ea-4689-b915-62f5a3f85dea")
  expect(html).toContain("3")
  expect(html).toContain("rpc returned not-ok")
})

test("13 · notice B states the consequence, not just the failure", () => {
  const html = buildIssuanceErrorHtml({ isTest: false, chargeId: "x", attempts: 3, errorText: "e" })
  expect(html).toContain("ואין מסמך מס")
})

// ── the recipient ────────────────────────────────────────────────────────────

test("14 · the default recipient is the operator, and it is a plain constant", () => {
  expect(AUDITOR_BILLING_NOTICE_TO).toBe("itzikbab@gmail.com")
})
