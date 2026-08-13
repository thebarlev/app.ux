import { test, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

/**
 * auditor_billing_events.payload must never be overwritten.
 *
 * The issuance attempt counter lives at payload.issuance_attempts, inside the object
 * Cardcom sent. That is safe today for one measured reason and no other: the indicator
 * route does a plain .insert() and swallows 23505, so a repeated indicator call is
 * ignored rather than upserted. Nothing overwrites the payload, so nothing resets the
 * counter, so the three-attempt limit holds.
 *
 * That is a measured fact about today's code, not a guarantee. An `on conflict
 * (event_id) do update` added later — an entirely reasonable-looking change — would
 * silently reset the counter on every Cardcom retry and turn the limit back into an
 * unbounded loop. Nothing in the schema prevents it and no reviewer would necessarily
 * connect the two.
 *
 * So the fact becomes an enforced constraint here instead of a migration. A migration
 * moving the counter to its own column would remove a risk that is measured not to
 * exist, and a migration is itself a risk. This test costs nothing and fails the moment
 * the assumption stops being true.
 *
 * If a future change genuinely needs an upsert on this table, that is the moment to
 * move issuance_attempts to its own column — and this test is what will say so.
 */

const ROOT = path.resolve(__dirname, "..", "..")

function sourceFilesTouchingTheTable(): string[] {
  const out: string[] = []
  const skip = new Set(["node_modules", ".next", ".git", "tests", "docs", "scripts"])
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!skip.has(e.name)) walk(path.join(dir, e.name))
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        const p = path.join(dir, e.name)
        if (fs.readFileSync(p, "utf8").includes("auditor_billing_events")) out.push(p)
      }
    }
  }
  walk(ROOT)
  return out
}

test("1 · some source actually references the table (the scan is not vacuously passing)", () => {
  const files = sourceFilesTouchingTheTable()
  expect(files.length).toBeGreaterThan(0)
})

test("2 ⛔ no .upsert() on auditor_billing_events", () => {
  for (const f of sourceFilesTouchingTheTable()) {
    const src = fs.readFileSync(f, "utf8")
    // Match a chained upsert on this table within a reasonable window, tolerating
    // whitespace and newlines between .from(...) and .upsert(...).
    const offending = /from\(\s*["'`]auditor_billing_events["'`]\s*\)[\s\S]{0,400}?\.upsert\(/.exec(src)
    expect(offending, `${path.relative(ROOT, f)} upserts auditor_billing_events`).toBeNull()
  }
})

test("3 ⛔ no `on conflict ... do update` on auditor_billing_events in any SQL in the repo", () => {
  const sqlDir = path.join(ROOT, "scripts")
  const offenders: string[] = []
  for (const name of fs.readdirSync(sqlDir)) {
    if (!name.endsWith(".sql")) continue
    const src = fs.readFileSync(path.join(sqlDir, name), "utf8")
    // Only flag an ON CONFLICT that both targets this table and does an UPDATE.
    const re = /insert\s+into\s+(?:public\.)?auditor_billing_events[\s\S]{0,800}?on\s+conflict[\s\S]{0,200}?do\s+update/gi
    if (re.test(src)) offenders.push(name)
  }
  expect(offenders, `these migrations upsert auditor_billing_events: ${offenders.join(", ")}`).toEqual([])
})

test("4 · the indicator route still inserts and tolerates 23505 rather than upserting", () => {
  const p = path.join(ROOT, "app/api/auditor/billing/cardcom/indicator/route.ts")
  const src = fs.readFileSync(p, "utf8")
  expect(src).toContain('from("auditor_billing_events").insert(')
  // The duplicate must be tolerated, not upserted — that is what makes the counter safe.
  expect(src).toContain("23505")
})
