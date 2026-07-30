import { updateSession } from "@/lib/supabase/proxy"
import type { NextRequest } from "next/server"

/**
 * Next 14 discovers middleware by filename and export name: `middleware.ts` at
 * the project root exporting `middleware`.
 *
 * This file was `proxy.ts` exporting `proxy`, which is the Next 15.5+ naming.
 * Under 14.2.24 nothing matched it, so it was never bundled and never ran —
 * `middleware-manifest.json` built with zero entries, and `updateSession` has no
 * other caller in the tree. It has been inert since the rename.
 *
 * The body and the matcher are unchanged. Only the filename and the export name
 * move, because those two are the whole bug.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
