/**
 * AUDITOR_BILLING_ACCOUNT_ID must fail closed.
 *
 * This variable decides which dealer a tax document is issued under. It used to
 * carry `.optional().default("4ae68334-…")` — the real production company — so a
 * missing or malformed value resolved silently to the live books, and every
 * test-isolation plan was a wish.
 *
 * Removing the default is only worth something if the resulting guard actually
 * refuses. A fail-closed guard that has never been observed refusing is an
 * assumption. These five cases observe it.
 *
 * Case 3 is the one that matters in practice: a stray space from pasting a value
 * into the Vercel dashboard is by far the most likely real-world corruption. If
 * `z.string().uuid()` silently trimmed, the guard would pass a value the rest of
 * the system might not, so the behaviour is asserted either way rather than
 * assumed.
 *
 * Node-level, no browser, no environment, no deployment: it calls the schema
 * directly. Run with `npm run test:unit`.
 */
import { test, expect } from "@playwright/test"
import { envSchema } from "@/lib/auditor/billing/env"

const VALID = "4ae68334-15a0-4fa3-a9ba-fd77deccc95d"

/** The other required-ish fields all default, so only this one is under test. */
function envWith(accountId: string | undefined): Record<string, string> {
  const base: Record<string, string> = {}
  if (accountId !== undefined) base.AUDITOR_BILLING_ACCOUNT_ID = accountId
  return base
}

test("1 · missing entirely -> throws", () => {
  expect(() => envSchema.parse(envWith(undefined))).toThrow()
})

test("2 · empty string -> throws", () => {
  expect(() => envSchema.parse(envWith(""))).toThrow()
})

test("3 · UUID with a leading or trailing space -> throws", () => {
  // The realistic corruption: a value pasted into the Vercel dashboard with an
  // invisible space. z.string().uuid() does not trim, so both must be rejected.
  expect(() => envSchema.parse(envWith(` ${VALID}`))).toThrow()
  expect(() => envSchema.parse(envWith(`${VALID} `))).toThrow()
  expect(() => envSchema.parse(envWith(`\t${VALID}\n`))).toThrow()
})

test("4 · a string that is not a UUID -> throws", () => {
  for (const bad of ["not-a-uuid", "4ae68334", "4ae68334-15a0-4fa3-a9ba", `${VALID}x`, "0"]) {
    expect(() => envSchema.parse(envWith(bad)), `expected ${JSON.stringify(bad)} to be rejected`).toThrow()
  }
})

test("5 · a valid UUID passes, and the value is exactly what was supplied", () => {
  const parsed = envSchema.parse(envWith(VALID))
  expect(parsed.AUDITOR_BILLING_ACCOUNT_ID).toBe(VALID)
  // No normalisation, no lowercasing, no substitution: what went in comes out.
  expect(parsed.AUDITOR_BILLING_ACCOUNT_ID).toHaveLength(36)
})

test("6 · the error names the variable, so a failed boot is diagnosable", () => {
  // A fail-closed guard whose message does not say what is wrong costs an hour at
  // the worst possible moment.
  let message = ""
  try {
    envSchema.parse(envWith(undefined))
  } catch (e: any) {
    message = JSON.stringify(e?.issues ?? e?.message ?? e)
  }
  expect(message).toContain("AUDITOR_BILLING_ACCOUNT_ID")
})
