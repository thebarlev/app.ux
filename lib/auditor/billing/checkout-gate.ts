/**
 * The one switch that decides whether the auditor checkout exists.
 *
 * Every checkout surface — the page, the start route, the callback — asks this and
 * nothing else. One gate rather than a flag per file, because a gate that has to be
 * remembered in six places is a gate that will be missed in one.
 *
 * ── FAIL CLOSED, AND WHY THAT IS NOT AS OBVIOUS AS IT SOUNDS ────────────────
 * An unset variable means OFF. The opposite has already happened here: an env-var
 * gate that was unset failed OPEN, which is the defect fixed in S1.3 and the reason
 * the auditor block is a hard-coded literal rather than a variable. This one is
 * written so that absent, empty and malformed all take the same branch as an
 * explicit "false".
 *
 * The comparison is `=== "true"` on a trimmed, lowercased value. `1`, `yes` and
 * `on` are rejected on purpose: a gate with several accepted spellings is a gate
 * whose state cannot be read at a glance in `vercel env ls`.
 *
 * ── NEVER NODE_ENV ─────────────────────────────────────────────────────────
 * NODE_ENV is "production" on a Vercel preview too, so a NODE_ENV check would
 * publish the checkout to the live site the moment it passed on a preview — the
 * same trap that pointed SHAAM's config at the wrong environment. VERCEL_ENV is the
 * only variable that separates preview from production, and it is undefined locally.
 *
 * The decision function is pure and takes the environment as an argument, so the
 * tests observe it directly rather than reloading a module and mutating globals.
 */

export type CheckoutEnv = "development" | "preview" | "production"

export type CheckoutGate =
  | { enabled: true; env: CheckoutEnv }
  | { enabled: false; reason: "flag_off" | "flag_malformed" | "production_not_permitted" }

type EnvBag = Record<string, string | undefined>

function resolveEnv(env: EnvBag): CheckoutEnv {
  const raw = String(env.VERCEL_ENV || "").trim().toLowerCase()
  if (raw === "production") return "production"
  if (raw === "preview") return "preview"
  // Undefined locally. Anything unrecognised is treated as local rather than as a
  // deployed environment — the production branch below is the strict one, and an
  // unknown value must not be able to reach it by accident.
  return "development"
}

export function checkoutGateFrom(env: EnvBag): CheckoutGate {
  const raw = env.AUDITOR_CHECKOUT_ENABLED
  const value = String(raw ?? "").trim().toLowerCase()

  if (value !== "true") {
    // Absent, empty and "false" are one answer. They are distinguished only so a
    // log line can say which, never so they behave differently.
    const off = raw === undefined || value === "" || value === "false"
    return { enabled: false, reason: off ? "flag_off" : "flag_malformed" }
  }

  const resolved = resolveEnv(env)

  /*
   * Production needs the flag AND a second, separate acknowledgement.
   *
   * Setting a variable to "true" is one click, and the same click on the wrong
   * environment row opens a payment page to real customers against a real terminal.
   * While the checkout is unproven, production stays shut even with the flag on.
   * AUDITOR_CHECKOUT_ALLOW_PRODUCTION is the deliberate second step and exists
   * nowhere yet.
   */
  if (resolved === "production") {
    const allow = String(env.AUDITOR_CHECKOUT_ALLOW_PRODUCTION ?? "").trim().toLowerCase()
    if (allow !== "true") return { enabled: false, reason: "production_not_permitted" }
  }

  return { enabled: true, env: resolved }
}

export function checkoutGate(): CheckoutGate {
  return checkoutGateFrom(process.env as EnvBag)
}

/** True only when the checkout may run here. Use this at the top of every surface. */
export function isCheckoutEnabled(): boolean {
  return checkoutGate().enabled
}
