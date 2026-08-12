import { test, expect } from "@playwright/test"
import { uniqAsmachtaAuditor } from "@/lib/auditor/billing/uniqAsmachta"

/**
 * ⛔ THESE TESTS ENFORCE A COINCIDENCE THAT DOES NOT ACTUALLY HOLD.
 *
 * Money moves at Cardcom when the customer submits the card. The charge row is
 * inserted much later, by the cron. So an insert rejected by a unique constraint is
 * rejected AFTER the card was charged, and the only thing standing between that and
 * "money taken, no charge row, no tax document" is this fallback in
 * process-indicator-event.ts:
 *
 *     if (!chargeId) {
 *       select id from auditor_subscription_charges where uniq_asmachta = uniq
 *     }
 *
 * That recovery works only if uniq_asmachta identifies exactly the same thing the
 * constraints do. Two constraints exist:
 *
 *   scripts/081  unique (uniq_asmachta)                        — GLOBAL, no status filter
 *   scripts/130  unique (company_id, subscription_period_start) where status='succeeded'
 *
 * So the property that has to hold is: uniqAsmachtaAuditor must be INJECTIVE on the
 * pair (company_id, subscription_period_start) — distinct pairs must never produce the
 * same string, or 081's global index rejects a legitimate charge from a different
 * company and the fallback then hands back SOMEONE ELSE'S charge row, which would be
 * invoiced to the wrong buyer.
 *
 * It is not injective. uniqAsmachtaAuditor keeps 12 hex characters of the company UUID
 * and truncates the period to a calendar day:
 *
 *     `a:${companyId.replaceAll("-","").slice(0,12)}:${yyyymmdd(periodStart)}`
 *
 * Two tests below fail on purpose. They are the enforced constraint that was asked
 * for — not a description of a hypothetical. When the formula and the indexes are
 * brought back into agreement, they go green with no edit.
 */

const PERIOD = "2026-09-01T00:00:00.000Z"

test("1 · the same company and period always produce the same string", () => {
  const a = uniqAsmachtaAuditor("68a5003b-1cd7-4716-8a58-58fb176373f6", PERIOD)
  const b = uniqAsmachtaAuditor("68a5003b-1cd7-4716-8a58-58fb176373f6", PERIOD)
  expect(a).toBe(b)
})

test("2 · different months produce different strings", () => {
  const sep = uniqAsmachtaAuditor("68a5003b-1cd7-4716-8a58-58fb176373f6", PERIOD)
  const oct = uniqAsmachtaAuditor("68a5003b-1cd7-4716-8a58-58fb176373f6", "2026-10-01T00:00:00.000Z")
  expect(sep).not.toBe(oct)
})

test("3 · plainly different companies produce different strings", () => {
  const a = uniqAsmachtaAuditor("68a5003b-1cd7-4716-8a58-58fb176373f6", PERIOD)
  const b = uniqAsmachtaAuditor("29fa2ea0-0023-4e95-9589-8e072dc5d8d0", PERIOD)
  expect(a).not.toBe(b)
})

test("4 ⛔ RED · two companies sharing 12 hex characters collide, and 081's index is global", () => {
  // Both UUIDs are valid and distinct. They differ only after the 12th hex character,
  // which is exactly where the formula stops looking.
  const companyA = "68a5003b-1cd7-4716-8a58-58fb176373f6"
  const companyB = "68a5003b-1cd7-9999-8a58-58fb176373f6"
  expect(companyA).not.toBe(companyB)

  // 48 bits, so a natural collision is astronomically unlikely with gen_random_uuid().
  // The severity is what matters: 081's unique index is global, so company B's insert
  // is rejected after B's card was charged, and the fallback returns COMPANY A's charge
  // row — which would then be invoiced to the wrong buyer.
  expect(uniqAsmachtaAuditor(companyA, PERIOD)).not.toBe(uniqAsmachtaAuditor(companyB, PERIOD))
})

test("5 ⛔ RED · two distinct period starts on the same calendar day collide", () => {
  // 130's index is on the full timestamptz. The formula keeps only yyyymmdd, so any two
  // period starts inside one UTC day are one key to the formula and two keys to the
  // index. computeMonthlyPeriod returns month boundaries today, which is why this has
  // never fired — but nothing enforces that, and a backfilled or hand-written row need
  // not sit on a boundary.
  const midnight = uniqAsmachtaAuditor("68a5003b-1cd7-4716-8a58-58fb176373f6", "2026-09-01T00:00:00.000Z")
  const midday = uniqAsmachtaAuditor("68a5003b-1cd7-4716-8a58-58fb176373f6", "2026-09-01T12:00:00.000Z")
  expect(midnight).not.toBe(midday)
})
