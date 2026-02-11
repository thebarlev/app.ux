import { redirect } from "next/navigation"
import PricingClient from "./pricing-client"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) {
    redirect("/login")
  }

  const { data: plans } = await supabase
    .from("plans")
    .select("id,name,price_monthly,documents_per_month,overage_unit_price,is_featured")
    .order("price_monthly", { ascending: true, nullsFirst: true })

  return <PricingClient plans={(plans as any) || []} />
}

