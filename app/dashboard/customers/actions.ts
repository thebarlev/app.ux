"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { revalidatePath } from "next/cache";

export type Customer = {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null; // Changed from mobile_phone to match DB schema
  created_at: string;
  updated_at: string;
};

export type CustomerPayload = {
  name: string;
  email?: string;
  phone?: string;
  mobile?: string; // Changed from mobile_phone to match DB schema
};

/**
 * Get all customers for the current user's company
 */
export async function getCustomersAction() {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("company_id", companyId)
      .order("name", { ascending: true });

    if (error) {
      return { ok: false as const, message: error.message, data: null };
    }

    return { ok: true as const, data: data as Customer[] };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error", data: null };
  }
}

/**
 * Get a single customer by ID
 */
export async function getCustomerByIdAction(customerId: string) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .single();

    if (error) {
      return { ok: false as const, message: error.message, data: null };
    }

    return { ok: true as const, data: data as Customer };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error", data: null };
  }
}

/**
 * Create a new customer
 */
export async function createCustomerAction(payload: CustomerPayload) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    // Validation
    if (!payload.name || payload.name.trim().length === 0) {
      return { ok: false as const, message: "שם הלקוח הוא שדה חובה" };
    }

    const { data, error } = await supabase
      .from("customers")
      .insert({
        company_id: companyId,
        name: payload.name.trim(),
        email: payload.email?.trim() || null,
        phone: payload.phone?.trim() || null,
        mobile: payload.mobile?.trim() || null, // Changed from mobile_phone
      })
      .select()
      .single();

    if (error) {
      return { ok: false as const, message: error.message };
    }

    revalidatePath("/dashboard/customers");
    return { ok: true as const, data: data as Customer };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}

/**
 * Update an existing customer
 */
export async function updateCustomerAction(customerId: string, payload: CustomerPayload) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    // Validation
    if (!payload.name || payload.name.trim().length === 0) {
      return { ok: false as const, message: "שם הלקוח הוא שדה חובה" };
    }

    const { data, error } = await supabase
      .from("customers")
      .update({
        name: payload.name.trim(),
        email: payload.email?.trim() || null,
        phone: payload.phone?.trim() || null,
        mobile: payload.mobile?.trim() || null, // Changed from mobile_phone
      })
      .eq("id", customerId)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) {
      return { ok: false as const, message: error.message };
    }

    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/${customerId}`);
    return { ok: true as const, data: data as Customer };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}

/**
 * Delete a customer
 */
export async function deleteCustomerAction(customerId: string) {
  try {
    const supabase = await createClient();
    const companyId = await getCompanyIdForUser();

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", customerId)
      .eq("company_id", companyId);

    if (error) {
      return { ok: false as const, message: error.message };
    }

    revalidatePath("/dashboard/customers");
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "unknown_error" };
  }
}
