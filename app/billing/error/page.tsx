import Link from "next/link"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function BillingErrorPage() {
  return (
    <div dir="rtl" className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-2xl font-bold text-danger">התשלום לא הושלם</div>
        <div className="text-muted-fg">אפשר לנסות שוב או ליצור קשר עם התמיכה אם הבעיה חוזרת.</div>
        <div className="flex items-center justify-center gap-4">
          <Link href="/pricing" className="underline">
            חזרה למסלולים
          </Link>
          <Link href="/dashboard" className="underline">
            חזרה לדשבורד
          </Link>
        </div>
      </div>
    </div>
  )
}

