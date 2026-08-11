import { notFound } from "next/navigation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The English checkout does not exist, and this route says so.
 *
 * It used to render the Hebrew AuditorCheckoutClient with a basePath prop, behind
 * `AUDITOR_BLOCKED = true` — so the render was already unreachable, and it was
 * reaching for a component whose props have since changed shape entirely.
 *
 * It stays a 404, which is exactly what it returned before. What changed is that the
 * dead branch is gone instead of being kept alive against a component it no longer
 * matches.
 *
 * Why not port it: the subscription flow is Hebrew-only by decision. The spec carries
 * no English copy, AuditorPlans renders nothing on an English page rather than show a
 * machine-translated price list, and inventing English copy for a payment screen is
 * not a call to make while porting a file. When an English flow is wanted it gets its
 * own copy, reviewed, and this route is written then.
 */
export default async function EnAuditorCheckoutPage() {
  notFound()
}
