import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const shouldRun = Boolean(
  process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.E2E_EXISTING_COMPANY_ID &&
    process.env.E2E_NEW_COMPANY_ID
);

test.describe("subscription snapshot lock", () => {
  test.skip(
    !shouldRun,
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_EXISTING_COMPANY_ID, E2E_NEW_COMPANY_ID"
  );

  test("existing subscription keeps snapshot after plan update; new subscription gets new snapshot", async () => {
    const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const existingCompanyId = process.env.E2E_EXISTING_COMPANY_ID as string;
    const newCompanyId = process.env.E2E_NEW_COMPANY_ID as string;
    const planId = String(process.env.E2E_PLAN_ID || "basic");

    const now = new Date();
    const startIso = now.toISOString();
    const end = new Date(now.getTime());
    end.setUTCMonth(end.getUTCMonth() + 1);
    const endIso = end.toISOString();

    const { data: planBefore, error: planBeforeErr } = await supabase
      .from("plans")
      .select("id, name, price_monthly, documents_per_month, overage_unit_price")
      .eq("id", planId)
      .single();
    expect(planBeforeErr).toBeNull();
    expect(planBefore).toBeTruthy();

    const originalPrice = Number((planBefore as any).price_monthly ?? 0);
    const originalDocs = Number((planBefore as any).documents_per_month ?? 0);
    const originalOverage = Number((planBefore as any).overage_unit_price ?? 0);

    const changedPrice = originalPrice + 7;
    const changedDocs = originalDocs + 5;
    const changedOverage = originalOverage + 1;

    const applyPlan = async (companyId: string) => {
      const { data, error } = await supabase.rpc("change_plan", {
        p_company_id: companyId,
        p_new_plan_id: planId,
        p_billing_period: "month",
        p_status: "active",
        p_period_start: startIso,
        p_period_end: endIso,
      });
      expect(error).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row?.ok).toBeTruthy();
    };

    await applyPlan(existingCompanyId);

    const { data: existingBefore, error: existingBeforeErr } = await supabase
      .from("subscriptions")
      .select("plan_snapshot_price, plan_snapshot_documents_limit, plan_snapshot_overage_unit_price")
      .eq("company_id", existingCompanyId)
      .single();
    expect(existingBeforeErr).toBeNull();
    expect(Number((existingBefore as any).plan_snapshot_price)).toBe(originalPrice);
    expect(Number((existingBefore as any).plan_snapshot_documents_limit)).toBe(originalDocs);
    expect(Number((existingBefore as any).plan_snapshot_overage_unit_price)).toBe(originalOverage);

    try {
      const { error: updatePlanErr } = await supabase
        .from("plans")
        .update({
          price_monthly: changedPrice,
          documents_per_month: changedDocs,
          overage_unit_price: changedOverage,
        })
        .eq("id", planId);
      expect(updatePlanErr).toBeNull();

      const { data: existingAfter, error: existingAfterErr } = await supabase
        .from("subscriptions")
        .select("plan_snapshot_price, plan_snapshot_documents_limit, plan_snapshot_overage_unit_price")
        .eq("company_id", existingCompanyId)
        .single();
      expect(existingAfterErr).toBeNull();
      expect(Number((existingAfter as any).plan_snapshot_price)).toBe(originalPrice);
      expect(Number((existingAfter as any).plan_snapshot_documents_limit)).toBe(originalDocs);
      expect(Number((existingAfter as any).plan_snapshot_overage_unit_price)).toBe(originalOverage);

      await applyPlan(newCompanyId);
      const { data: newAfter, error: newAfterErr } = await supabase
        .from("subscriptions")
        .select("plan_snapshot_price, plan_snapshot_documents_limit, plan_snapshot_overage_unit_price")
        .eq("company_id", newCompanyId)
        .single();
      expect(newAfterErr).toBeNull();
      expect(Number((newAfter as any).plan_snapshot_price)).toBe(changedPrice);
      expect(Number((newAfter as any).plan_snapshot_documents_limit)).toBe(changedDocs);
      expect(Number((newAfter as any).plan_snapshot_overage_unit_price)).toBe(changedOverage);
    } finally {
      await supabase
        .from("plans")
        .update({
          price_monthly: originalPrice,
          documents_per_month: originalDocs,
          overage_unit_price: originalOverage,
        })
        .eq("id", planId);
    }
  });
});
