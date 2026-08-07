import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * SECURITY: `x-auditor-scan-guest` is a trusted signal. app/en/auditor/(account)/
 * layout.tsx skips its login redirect when it is present, so ONLY this middleware
 * may set it — an inbound copy from the internet must never reach a Server
 * Component.
 *
 * Every request forwarded downstream is passed through here first, unconditionally
 * and on every path, before any branch below can set the header. It is not scoped
 * to /en/auditor on purpose: scoping the strip to the paths we happen to think of
 * leaves the same hole on the next route someone adds.
 *
 * Built per call rather than once at the top of updateSession because
 * `request.cookies.set()` updates the request's cookie header, and the Supabase
 * session refresh depends on that updated value being the one forwarded.
 */
function forwardedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers)
  headers.delete("x-auditor-scan-guest")
  return headers
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: { headers: forwardedHeaders(request) },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({
          request: { headers: forwardedHeaders(request) },
        })
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isEnAuditorDashboard = path === "/en/auditor/dashboard"
  const isEnAuditorCheckout = path === "/en/auditor/checkout"
  const scanId = request.nextUrl.searchParams.get("scan_id")
  const token = request.nextUrl.searchParams.get("token")

  // EN auditor: allow unauthenticated access to dashboard when scan_id+token present (guest scan view)
  // Built from forwardedHeaders so the value below is the only possible source.
  if (isEnAuditorDashboard && scanId && token) {
    const requestHeaders = forwardedHeaders(request)
    requestHeaders.set("x-auditor-scan-guest", "1")
    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  }

  // EN auditor: require auth for dashboard (without scan params) and checkout
  if ((isEnAuditorDashboard || isEnAuditorCheckout) && !user) {
    const returnTo = request.nextUrl.pathname + request.nextUrl.search
    const url = request.nextUrl.clone()
    url.pathname = "/en/auditor/login"
    url.searchParams.set("returnTo", returnTo)
    return NextResponse.redirect(url)
  }

  const isAdminRoute = path.startsWith("/admin")
  const isLoginPage = request.nextUrl.pathname === "/admin/login"

  // Admin route handling
  if (isAdminRoute) {
    // Allow access to login page without authentication
    if (isLoginPage) {
      // If already logged in and is admin, redirect to dashboard
      if (user) {
        const { data: adminData } = await supabase
          .from("system_admins")
          .select("id")
          .eq("auth_user_id", user.id)
          .maybeSingle()
        
        if (adminData) {
          const url = request.nextUrl.clone()
          url.pathname = "/admin"
          return NextResponse.redirect(url)
        }
        // If user exists but not admin, allow to see login page with error
      }
      // Not logged in, allow to see login page
      return supabaseResponse
    }

    // Protect all other admin routes
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = "/admin/login"
      return NextResponse.redirect(url)
    }

    // Verify user is admin
    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()

    if (!adminData) {
      const url = request.nextUrl.clone()
      url.pathname = "/admin/login"
      url.searchParams.set("error", "unauthorized")
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
