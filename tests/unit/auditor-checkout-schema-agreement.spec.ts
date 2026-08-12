import { test, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

/**
 * ⛔ THE CLIENT AND THE SERVER MUST AGREE ABOUT WHICH FIELDS ARE REQUIRED.
 *
 * They diverged and nobody knew until a payment could not be made. The client stopped
 * requiring business_name and tax_id; the server's zod schema still had min(1) and min(5).
 * Every submission returned 400, Cardcom was never contacted, and the visitor was told to
 * "try again in a moment" — which could never work. One form, two descriptions of it, and
 * the only detector was a person failing to pay.
 *
 * Same approach as the uniq_asmachta tests: turn the agreement into an enforced constraint
 * rather than a thing everyone remembers. This reads both files as text — no imports, so
 * the server route's `server-only` dependencies never load into the test process.
 *
 * ⚠️ It checks REQUIREDNESS, not full shape. A test that tried to mirror every zod rule in
 * a regex would be a second schema to keep in sync — the exact problem it exists to catch.
 */

const ROOT = path.resolve(__dirname, "..", "..")
const SERVER = path.join(ROOT, "app/api/auditor/billing/checkout/start/route.ts")
const CLIENT = path.join(ROOT, "app/auditor/checkout/AuditorCheckoutClient.tsx")

const serverSrc = fs.readFileSync(SERVER, "utf8")
const clientSrc = fs.readFileSync(CLIENT, "utf8")

/** The zod line for one body field, e.g. `business_name: z.string().max(160).optional(),` */
function serverField(name: string): string {
  const m = new RegExp(`^\\s*${name}:\\s*z\\.[^\\n]*$`, "m").exec(serverSrc)
  expect(m, `${name} is not in the server body schema`).not.toBeNull()
  return (m as RegExpExecArray)[0]
}

function serverRequires(name: string): boolean {
  const line = serverField(name)
  if (line.includes(".optional()")) return false
  // A string with a positive minimum length cannot be satisfied by "".
  return /\.min\(\s*[1-9]/.test(line) || !line.includes(".min(")
}

/**
 * Does the client's validate() refuse to submit when this field is empty?
 *
 * ⚠️ The first version of this looked for `if (!f.<field>` and reported a false divergence
 * on `phone`, which the client requires through a LENGTH check rather than an emptiness
 * one. The detector was wrong, not the code — so the rule is now semantic rather than
 * syntactic:
 *
 *   a field is OPTIONAL iff its error is raised only when a value is present,
 *   i.e. the assignment is guarded by `f.<field>.trim() &&`
 *
 * Anything else — an emptiness check, a length check, a format check — rejects an empty
 * value and therefore makes the field required. That covers every shape validate() uses
 * without this test having to model each one.
 */
function clientRequires(field: string): boolean {
  const body = /function validate\(([\s\S]*?)\n}/.exec(clientSrc)
  expect(body, "validate() not found in the client").not.toBeNull()
  const src = (body as RegExpExecArray)[1]

  const assigns = new RegExp(`errors\\.${field}\\s*=`).test(src)
  if (!assigns) return false // never rejected at all

  const guarded = new RegExp(`f\\.${field}\\.trim\\(\\)\\s*&&`).test(src)
  return !guarded
}

const PAIRS: Array<{ server: string; client: string }> = [
  { server: "full_name", client: "fullName" },
  { server: "email", client: "email" },
  { server: "phone", client: "phone" },
  { server: "business_name", client: "businessName" },
  { server: "tax_id", client: "taxId" },
]

test("1 · every field the client sends exists in the server schema", () => {
  for (const p of PAIRS) expect(() => serverField(p.server)).not.toThrow()
})

for (const p of PAIRS) {
  test(`2 ⛔ ${p.server}: client and server agree on whether it is required`, () => {
    expect(
      serverRequires(p.server),
      `server requires ${p.server}=${serverRequires(p.server)} but client requires ${p.client}=${clientRequires(p.client)}`
    ).toBe(clientRequires(p.client))
  })
}

test("3 · business_name and tax_id are optional on BOTH sides", () => {
  // The specific divergence that broke the checkout, pinned by name so a future change
  // that reintroduces min(1) on either side fails here rather than at a payment.
  expect(serverRequires("business_name")).toBe(false)
  expect(clientRequires("businessName")).toBe(false)
  expect(serverRequires("tax_id")).toBe(false)
  expect(clientRequires("taxId")).toBe(false)
})

test("4 · a supplied tax id is still checked — optional is not unvalidated", () => {
  // Empty allowed, wrong refused: nine digits that fail the checksum would put a number
  // belonging to nobody on a tax document.
  expect(serverSrc).toMatch(/taxIdRaw\s*&&\s*!isValidIsraeliId/)
  expect(clientSrc).toMatch(/f\.taxId\.trim\(\)\s*&&\s*!isValidIsraeliId/)
})

test("5 · the client separates a 4xx from a transient failure", () => {
  // "try again in a moment" on a permanent 400 is what sent someone to press the button
  // repeatedly against a wall.
  expect(clientSrc).toMatch(/res\.status\s*>=\s*400\s*&&\s*res\.status\s*<\s*500/)
  expect(clientSrc).toContain("לא עבר אימות")
})

test("6 ⛔ the server still refuses to name the offending field", () => {
  expect(serverSrc).toContain('error: "invalid_request"')
  // The reason belongs in the log, not the response.
  expect(serverSrc).toMatch(/console\.warn\([^)]*body rejected/)
})
