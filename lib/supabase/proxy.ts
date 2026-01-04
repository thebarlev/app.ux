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

  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin")
  const isAdminLoginPage = request.nextUrl.pathname === "/admin/login"
  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard")
  const isBusinessLoginPage = request.nextUrl.pathname === "/login"
  const isRegisterPage = request.nextUrl.pathname.startsWith("/register")

  // Admin route handling
  if (isAdminRoute) {
    // Allow access to login page without authentication
    if (isAdminLoginPage) {
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

  // Business owner route handling
  if (isDashboardRoute) {
    // Redirect to login if not authenticated
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      return NextResponse.redirect(url)
    }

    // Verify user has company membership
    const { data: memberData } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle()

    // If no company_members record, check if user owns a company directly
    if (!memberData) {
      const { data: companyData } = await supabase
        .from("companies")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("status", "active")
        .maybeSingle()

      if (!companyData) {
        // User authenticated but has no company access
        const url = request.nextUrl.clone()
        url.pathname = "/login"
        url.searchParams.set("error", "no_company")
        return NextResponse.redirect(url)
      }
    }
  }

  // Redirect authenticated business owners away from login page
  if (isBusinessLoginPage && user && !isRegisterPage) {
    // Check if user has company access
    const { data: memberData } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle()

    // Only query companies table if user is not a member
    let companyData = null;
    if (!memberData) {
      const { data } = await supabase
        .from("companies")
        .select("id")
        .eq("auth_user_id", user.id)
        .eq("status", "active")
        .maybeSingle()
      companyData = data;
    }

    if (memberData || companyData) {
      const url = request.nextUrl.clone()
      url.pathname = "/dashboard"
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
