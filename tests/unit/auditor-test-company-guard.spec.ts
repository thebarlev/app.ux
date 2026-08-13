import { test, expect } from "@playwright/test"
import { decideTestCompanyRefusal } from "@/lib/security/test-company-guard"

/**
 * The fifth structural requirement in the work order: a test that observes the guard
 * refusing. A guard nobody watched refuse is a guard you do not have — the same
 * argument that produced the AUDITOR_BILLING_ACCOUNT_ID tests.
 *
 * The unknown cases matter more than the obvious one. is_test = true refusing is easy
 * to get right; a null flag, a missing row or a failed query silently passing is how
 * a test document ends up in a regulatory filing.
 */

const OP = "shaam_allocation_request"
const ID = "68a5003b-1cd7-4716-8a58-58fb176373f6"

test("1 · is_test true -> refuses", () => {
  const r = decideTestCompanyRefusal({ companyId: ID, operation: OP, row: { is_test: true } })
  expect(r).not.toBeNull()
  expect(r!.message).toContain("is_test is true")
})

test("2 · is_test false -> allowed, and that is the ONLY value that allows", () => {
  expect(decideTestCompanyRefusal({ companyId: ID, operation: OP, row: { is_test: false } })).toBeNull()
})

test("3 ⚠ is_test null -> refuses. Unknown is not permission", () => {
  const r = decideTestCompanyRefusal({ companyId: ID, operation: OP, row: { is_test: null } })
  expect(r).not.toBeNull()
})

test("4 ⚠ is_test missing from the row -> refuses", () => {
  const r = decideTestCompanyRefusal({ companyId: ID, operation: OP, row: {} })
  expect(r).not.toBeNull()
})

test("5 ⚠ no company row -> refuses", () => {
  const r = decideTestCompanyRefusal({ companyId: ID, operation: OP, row: null })
  expect(r).not.toBeNull()
  expect(r!.message).toContain("no such company")
})

test("6 ⚠ the query itself failed -> refuses. Cannot-tell behaves like is-a-test", () => {
  const r = decideTestCompanyRefusal({ companyId: ID, operation: OP, row: null, queryFailed: true })
  expect(r).not.toBeNull()
  expect(r!.message).toContain("could not read")
})

test("7 · a truthy non-boolean does not sneak through", () => {
  // "false" the string is truthy in JS, and a column read through a loose client
  // could plausibly deliver it. Only the boolean false is permission.
  const r = decideTestCompanyRefusal({ companyId: ID, operation: OP, row: { is_test: "false" as unknown } })
  expect(r).not.toBeNull()
})

test("8 · the refusal names the company and the operation, so a log line is diagnosable", () => {
  const r = decideTestCompanyRefusal({ companyId: ID, operation: OP, row: { is_test: true } })
  expect(r!.companyId).toBe(ID)
  expect(r!.operation).toBe(OP)
  expect(r!.message).toContain(ID)
  expect(r!.message).toContain(OP)
})
