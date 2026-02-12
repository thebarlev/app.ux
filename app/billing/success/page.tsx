import Link from "next/link"
import { ConfirmOnSuccessClient } from "./ConfirmOnSuccessClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function BillingSuccessPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const lowprofilecodeRaw = searchParams?.lowprofilecode ?? searchParams?.LowProfileCode
  const lowProfileCode = Array.isArray(lowprofilecodeRaw) ? lowprofilecodeRaw[0] : lowprofilecodeRaw

  return (
    <div dir="rtl" className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-2xl font-bold">התשלום התקבל</div>
        <div className="text-muted-fg">אפשר להמשיך לעבוד כרגיל. אם לא עודכן מיידית, רעננו את הדשבורד.</div>
        <ConfirmOnSuccessClient lowProfileCode={typeof lowProfileCode === "string" ? lowProfileCode : null} />
        <Link href="/dashboard" className="inline-block underline">
          חזרה לדשבורד
        </Link>
      </div>
    </div>
  )
}

