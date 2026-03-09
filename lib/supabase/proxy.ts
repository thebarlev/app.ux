import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
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
          request,
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
  if (isEnAuditorDashboard && scanId && token) {
    const requestHeaders = new Headers(request.headers)
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
