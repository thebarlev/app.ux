import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function IntegrationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return (
    <main dir="rtl" className="min-h-screen bg-bg">
      <div className="ui-container pt-10">
        <div className="mb-[50px]">
          <h1 className="text-right mb-4">אינטגרציות</h1>
          <p className="text-right">חיבורים לשירותים חיצוניים.</p>
        </div>

        <div className="rounded-[20px] border border-border/60 bg-white/80 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="text-right">
              <div className="text-lg font-semibold text-fg">SHAAM / רשות המסים</div>
              <div className="text-sm text-muted-fg mt-1">חיבור OAuth2 (Sandbox) לניהול סטטוס והתחברות מחדש.</div>
            </div>
            <Link
              href="/dashboard/settings/integrations/shaam"
              className="inline-flex items-center justify-center rounded-[5px] h-[50px] px-5 text-[18px] font-medium text-white"
              style={{ backgroundColor: "#5389BB" }}
            >
              ניהול החיבור
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

