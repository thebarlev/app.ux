"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import { revalidatePath } from "next/cache";

export type Customer = {
  id: string;
  company_id: string;
  name: string;
  tax_id: string | null;
  profession: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  phone_secondary: string | null;
  mobile: string | null;
  address_street: string | null;
  address_number: string | null;
  address_city: string | null;
  address_zip: string | null;
  address_country: string | null;
  payment_terms_text: string | null;
  external_account_key: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerPayload = {
  name: string;
  tax_id?: string;
  profession?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  phone_secondary?: string;
  mobile?: string;
  address_street?: string;
  address_number?: string;
  address_city?: string;
  address_zip?: string;
  address_country?: string;
  payment_terms_text?: string;
  external_account_key?: string;
  bank_name?: string;
  bank_branch?: string;
  bank_account?: string;
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
        tax_id: payload.tax_id?.trim() || null,
        profession: payload.profession?.trim() || null,
        contact_person: payload.contact_person?.trim() || null,
        email: payload.email?.trim() || null,
        phone: payload.phone?.trim() || null,
        phone_secondary: payload.phone_secondary?.trim() || null,
        mobile: payload.mobile?.trim() || null,
        address_street: payload.address_street?.trim() || null,
        address_number: payload.address_number?.trim() || null,
        address_city: payload.address_city?.trim() || null,
        address_zip: payload.address_zip?.trim() || null,
        address_country: payload.address_country?.trim() || 'ישראל',
        payment_terms_text: payload.payment_terms_text?.trim() || null,
        external_account_key: payload.external_account_key?.trim() || null,
        bank_name: payload.bank_name?.trim() || null,
        bank_branch: payload.bank_branch?.trim() || null,
        bank_account: payload.bank_account?.trim() || null,
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
        tax_id: payload.tax_id?.trim() || null,
        profession: payload.profession?.trim() || null,
        contact_person: payload.contact_person?.trim() || null,
        email: payload.email?.trim() || null,
        phone: payload.phone?.trim() || null,
        phone_secondary: payload.phone_secondary?.trim() || null,
        mobile: payload.mobile?.trim() || null,
        address_street: payload.address_street?.trim() || null,
        address_number: payload.address_number?.trim() || null,
        address_city: payload.address_city?.trim() || null,
        address_zip: payload.address_zip?.trim() || null,
        address_country: payload.address_country?.trim() || 'ישראל',
        payment_terms_text: payload.payment_terms_text?.trim() || null,
        external_account_key: payload.external_account_key?.trim() || null,
        bank_name: payload.bank_name?.trim() || null,
        bank_branch: payload.bank_branch?.trim() || null,
        bank_account: payload.bank_account?.trim() || null,
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
