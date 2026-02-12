type BillingPeriod = "month" | "year";
type SubscriptionStatus = "trial" | "active" | "blocked" | "canceled" | "past_due";

type ChangePlanArgs = {
  supabase: any;
  companyId: string;
  newPlanId: string;
  billingPeriod: BillingPeriod;
  status?: SubscriptionStatus;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
};

export async function changePlanSnapshot(args: ChangePlanArgs): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, companyId, newPlanId, billingPeriod, status, currentPeriodStart, currentPeriodEnd } = args;

  const { data, error } = await supabase.rpc("change_plan", {
    p_company_id: companyId,
    p_new_plan_id: newPlanId,
    p_billing_period: billingPeriod,
    p_status: status ?? null,
    p_period_start: currentPeriodStart ?? null,
    p_period_end: currentPeriodEnd ?? null,
  });

  if (error) {
    return { ok: false, message: error.message || "change_plan RPC failed" };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.ok !== true) {
    return { ok: false, message: String(row?.reason || "change_plan failed") };
  }

  return { ok: true };
}
