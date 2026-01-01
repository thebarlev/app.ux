import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getTemplateByIdAction } from "../actions"
import TemplateEditorClient from "./TemplateEditorClient"
import { Loader2 } from "lucide-react"

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch template
  const result = await getTemplateByIdAction(id)

  if (!result.ok) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-red-600">שגיאה בטעינת תבנית</p>
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
        <TemplateEditorClient template={result.template} />
      </Suspense>
    </div>
  )
}
