import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Check if the user/company has an active auditor customer.
 * Returns { allowed: boolean, reason?: string }.
 */
export async function checkAuditorCustomerActive(
  admin: SupabaseClient,
  params: { companyId?: string | null; userId?: string | null }
): Promise<{ allowed: boolean; reason?: string }> {
  const { companyId, userId } = params

  if (companyId) {
    const { data: sub } = await admin
      .from("auditor_subscriptions")
      .select("customer_id, status")
      .eq("company_id", companyId)
      .maybeSingle()

    if (!sub) return { allowed: false, reason: "no_subscription" }
    if (sub.status !== "active") return { allowed: false, reason: "subscription_not_active" }

    const customerId = (sub as any).customer_id
    if (customerId) {
      const { data: cust } = await admin
        .from("auditor_customers")
        .select("customer_status")
        .eq("id", customerId)
        .maybeSingle()
      const status = (cust as any)?.customer_status
      if (status && status !== "active") {
        return { allowed: false, reason: `customer_${status}` }
      }
    }
    return { allowed: true }
  }

  if (userId) {
    const { data: cust } = await admin
      .from("auditor_customers")
      .select("customer_status")
      .eq("user_id", userId)
      .eq("customer_status", "active")
      .limit(1)
      .maybeSingle()
    if (!cust) {
      const { data: anyCust } = await admin
        .from("auditor_customers")
        .select("customer_status")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle()
      const status = (anyCust as any)?.customer_status
      if (status && status !== "active") {
        return { allowed: false, reason: `customer_${status}` }
      }
      return { allowed: false, reason: "no_customer" }
    }
    return { allowed: true }
  }

  return { allowed: false, reason: "no_company_or_user" }
}
