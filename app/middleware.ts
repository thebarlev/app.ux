import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const ALLOWED_IP = "62.90.184.237"

function getClientIp(req: NextRequest) {
  // Cloudflare
  const cf = req.headers.get("cf-connecting-ip")
  if (cf) return cf.trim()

  // Proxies
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()

  return req.ip || ""
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith("/admin")) {
    // לא לחסום בלוקאל כדי שלא תינעל על עצמך בפיתוח
    if (process.env.NODE_ENV !== "production") return NextResponse.next()
        console.log("[admin-ip]", {
            cf: request.headers.get("cf-connecting-ip"),
            xff: request.headers.get("x-forwarded-for"),
            ip: request.ip,
            host: request.headers.get("host"),
            path: request.nextUrl.pathname,
          })
          
    const ip = getClientIp(request)
    if (ip !== ALLOWED_IP) {
      return new NextResponse("Not Found", { status: 404 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
