import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getTemplatesAction } from "./actions"
import TemplatesClient from "./TemplatesClient"
import { Loader2 } from "lucide-react"

export const metadata = {
  title: "ניהול תבניות מסמכים",
  description: "ניהול תבניות HTML/CSS למסמכים",
}

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch templates
  const result = await getTemplatesAction()

  if (!result.ok) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-red-600">שגיאה בטעינת תבניות</p>
          <p className="text-sm text-muted-foreground mt-2">{result.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-[50vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <TemplatesClient initialTemplates={result.templates} />
      </Suspense>
    </div>
  )
}
