/**
 * A test company's data never leaves the building.
 *
 * companies.is_test was added by migration 130. The column on its own is a label; it
 * only means something where something refuses because of it, and this is that
 * refusal. Every outbound regulatory path asks this before it talks to anyone:
 * an allocation request to the tax authority, any SHAAM filing, the uniform file, and
 * any future external report.
 *
 * ── IT THROWS. IT DOES NOT FILTER ───────────────────────────────────────────
 * The work order is explicit that this must be `if (company.is_test) throw`, never a
 * `where is_test = false` in a query, and the distinction is the whole point. A
 * filter silently produces a smaller correct-looking result; a throw stops the
 * operation and names the reason. A test document that quietly fails to appear in a
 * filing is indistinguishable from one that was never created, and the failure would
 * surface as a missing row in a regulatory file months later.
 *
 * ── IT ALSO THROWS WHEN IT CANNOT TELL ──────────────────────────────────────
 * A missing company row, an unreadable flag, a query error — all refuse. This guard
 * exists to prevent one specific irreversible event, so "I could not determine
 * whether this is a test company" has to behave exactly like "it is one". Failing
 * open here would defeat the entire purpose of adding the column.
 *
 * ── AND IT IS TESTED ────────────────────────────────────────────────────────
 * The work order names five structural requirements and the fifth is a test that
 * observes the guard refusing, because a guard nobody watched refuse is a guard you
 * do not have. See tests/unit/auditor-test-company-guard.spec.ts.
 *
 * ── WHY THIS FILE HAS NO `server-only` ──────────────────────────────────────
 * The decision is a pure function of a row so the tests can call it directly. The
 * part that touches the database — and therefore must never reach a client bundle —
 * lives in test-company-guard.server.ts, which carries the `server-only` marker and
 * is the import every route should reach for.
 */

export class TestCompanyRefusal extends Error {
  readonly companyId: string
  readonly operation: string

  constructor(companyId: string, operation: string, detail: string) {
    super(
      `Refusing ${operation} for company ${companyId}: ${detail}. ` +
        `Test-company data must never reach an external or regulatory destination.`
    )
    this.name = "TestCompanyRefusal"
    this.companyId = companyId
    this.operation = operation
  }
}

/** The decision, separated from the lookup so it can be observed directly. */
export function decideTestCompanyRefusal(params: {
  companyId: string
  operation: string
  row: { is_test?: unknown } | null
  queryFailed?: boolean
}): TestCompanyRefusal | null {
  const { companyId, operation, row, queryFailed } = params

  if (queryFailed) {
    return new TestCompanyRefusal(companyId, operation, "could not read companies.is_test")
  }
  if (!row) {
    return new TestCompanyRefusal(companyId, operation, "no such company")
  }

  const flag = (row as any).is_test

  // Only an explicit boolean false clears this. A null, an undefined or anything
  // non-boolean means the answer is unknown, and unknown refuses.
  if (flag === false) return null
  if (flag === true) {
    return new TestCompanyRefusal(companyId, operation, "companies.is_test is true")
  }
  return new TestCompanyRefusal(companyId, operation, `companies.is_test is not a boolean (${typeof flag})`)
}
