import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import NewTemplateClient from "./NewTemplateClient"
import { Loader2 } from "lucide-react"

export const metadata = {
  title: "תבנית חדשה",
  description: "צור תבנית HTML/CSS חדשה למסמכים",
}

export default async function NewTemplatePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <NewTemplateClient />
    </Suspense>
  )
}
