import { test, expect } from "@playwright/test"
import { checkoutGateFrom } from "@/lib/auditor/billing/checkout-gate"

/**
 * The gate is the only thing standing between a preview and a real payment page,
 * so its closed states are tested as carefully as its open one. A guard nobody
 * tested is a guard you do not have — the same argument the work order makes about
 * the is_test refusals.
 */

/**
 * The decision is a pure function of the environment, so each case passes exactly
 * the variables it is about and nothing global is mutated.
 */
function gate(env: Record<string, string | undefined>) {
  return checkoutGateFrom(env)
}

test("1 · unset -> closed", () => {
  expect(gate({ AUDITOR_CHECKOUT_ENABLED: undefined, VERCEL_ENV: "preview" }))
    .toEqual({ enabled: false, reason: "flag_off" })
})

test("2 · empty string -> closed", () => {
  expect(gate({ AUDITOR_CHECKOUT_ENABLED: "", VERCEL_ENV: "preview" }))
    .toEqual({ enabled: false, reason: "flag_off" })
})

test("3 · \"false\" -> closed", () => {
  expect(gate({ AUDITOR_CHECKOUT_ENABLED: "false", VERCEL_ENV: "preview" }))
    .toEqual({ enabled: false, reason: "flag_off" })
})

test("4 · \"1\" is NOT true — one accepted spelling only", () => {
  expect(gate({ AUDITOR_CHECKOUT_ENABLED: "1", VERCEL_ENV: "preview" }))
    .toEqual({ enabled: false, reason: "flag_malformed" })
})

test("5 · \"yes\" is NOT true", () => {
  expect(gate({ AUDITOR_CHECKOUT_ENABLED: "yes", VERCEL_ENV: "preview" }))
    .toEqual({ enabled: false, reason: "flag_malformed" })
})

test("6 · \" TRUE \" is accepted — trimmed and lowercased, but nothing else", () => {
  expect(gate({ AUDITOR_CHECKOUT_ENABLED: " TRUE ", VERCEL_ENV: "preview" }))
    .toEqual({ enabled: true, env: "preview" })
})

test("7 · open on preview when the flag is true", () => {
  expect(gate({ AUDITOR_CHECKOUT_ENABLED: "true", VERCEL_ENV: "preview" }))
    .toEqual({ enabled: true, env: "preview" })
})

test("8 · open locally, where VERCEL_ENV is undefined", () => {
  expect(gate({ AUDITOR_CHECKOUT_ENABLED: "true", VERCEL_ENV: undefined }))
    .toEqual({ enabled: true, env: "development" })
})

test("9 ⚠ production stays closed on the flag alone", () => {
  expect(gate({ AUDITOR_CHECKOUT_ENABLED: "true", VERCEL_ENV: "production", AUDITOR_CHECKOUT_ALLOW_PRODUCTION: undefined }))
    .toEqual({ enabled: false, reason: "production_not_permitted" })
})

test("10 · production opens only with the second, explicit acknowledgement", () => {
  expect(gate({ AUDITOR_CHECKOUT_ENABLED: "true", VERCEL_ENV: "production", AUDITOR_CHECKOUT_ALLOW_PRODUCTION: "true" }))
    .toEqual({ enabled: true, env: "production" })
})

test("11 ⚠ NODE_ENV cannot open it — that is the trap this gate exists to avoid", () => {
  expect(gate({ AUDITOR_CHECKOUT_ENABLED: undefined, NODE_ENV: "production", VERCEL_ENV: "production" }))
    .toEqual({ enabled: false, reason: "flag_off" })
})
