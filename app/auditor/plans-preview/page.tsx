/**
 * TEMPORARY. Preview-only view of the subscription section on its own.
 *
 * Why it exists: the section lives inside AuditorReportV3, which only renders
 * once a scan has reached step 3 with a score. A scan started from a Vercel
 * preview runs from a datacenter IP, and WAF-protected sites 403 the crawler
 * there, so the report may never appear at all — and that failure does not
 * reproduce locally. This route is the only way to put the real component,
 * built by the real build, in front of a human on a preview URL.
 *
 * ⚠️ DELETE THIS DIRECTORY BEFORE MERGING TO main. It is a review aid, not a
 * feature. If you are reading this on main, the deletion was missed.
 *
 * The environment gate is VERCEL_ENV, not NODE_ENV. NODE_ENV is "production" on
 * a Vercel preview too, so a NODE_ENV check here would publish this route to the
 * live site. VERCEL_ENV is the only variable that separates the three.
 */
import { notFound } from "next/navigation"
import PlansPreviewClient from "./PlansPreviewClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function AuditorPlansPreviewPage() {
  const env = process.env.VERCEL_ENV

  // Preview only. Local development has no VERCEL_ENV; "production" and
  // anything unexpected are refused, so this fails closed.
  if (env !== "preview" && env !== undefined) notFound()

  return <PlansPreviewClient />
}
