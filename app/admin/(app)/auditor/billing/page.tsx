import { createServiceRoleClient } from "@/lib/supabase/server"
import { AdminAuditorBillingTable } from "@/components/admin/auditor/AdminAuditorBillingTable"

export const dynamic = "force-dynamic"

export default async function AdminAuditorBillingPage() {
  const admin = createServiceRoleClient()

  const [
    { data: subscriptions, error: subErr },
    { data: charges, error: chargeErr },
    { data: checkouts, error: checkoutErr },
  ] = await Promise.all([
    admin
      .from("auditor_subscriptions")
      .select("company_id,plan_id,status,current_period_start,current_period_end,cancel_at_period_end,failed_attempts,next_billing_date,companies(company_name,email)")
      .order("updated_at", { ascending: false })
      .limit(50),

    admin
      .from("auditor_subscription_charges")
      .select("id,company_id,plan_id,status,amount,currency,subscription_period_start,created_at,uniq_asmachta,companies(company_name)")
      .order("created_at", { ascending: false })
      .limit(50),

    admin
      .from("auditor_checkout_sessions")
      .select("id,company_id,plan_id,status,amount,created_at,provider_low_profile_code,link_id,companies(company_name)")
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  const errors = [subErr, chargeErr, checkoutErr].filter(Boolean)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Billing Debug</h1>
        <p className="mt-1 text-slate-500">
          Inspect subscriptions, charges, and checkout sessions. Read-only view.
        </p>
        {errors.length > 0 && (
          <div className="mt-2 space-y-1">
            {errors.map((e, i) => (
              <div key={i} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {(e as any).message}
              </div>
            ))}
          </div>
        )}
      </div>

      <AdminAuditorBillingTable
        subscriptions={(subscriptions ?? []) as any}
        charges={(charges ?? []) as any}
        checkouts={(checkouts ?? []) as any}
      />
    </div>
  )
}
