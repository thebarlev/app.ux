"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { clearTextCache } from "@/lib/system-texts";

/**
 * Verify user is admin
 */
async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data: adminData } = await supabase
    .from("system_admins")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!adminData) {
    throw new Error("Not authorized - admin only");
  }

  return { supabase, user };
}

/**
 * Get all system texts grouped by page
 */
export async function getAllTextsAction() {
  try {
    const { supabase } = await verifyAdmin();

    const { data, error } = await supabase
      .from("system_texts")
      .select("*")
      .order("page", { ascending: true })
      .order("key", { ascending: true });

    if (error) {
      console.error("[TextsAction] Error fetching texts:", error);
      return { ok: false, message: error.message };
    }

    // Group by page
    const grouped: Record<
      string,
      Array<{
        id: string;
        key: string;
        page: string;
        default_value: string;
        value: string | null;
        description: string | null;
        updated_at: string;
      }>
    > = {};

    data?.forEach((text) => {
      if (!grouped[text.page]) {
        grouped[text.page] = [];
      }
      grouped[text.page].push(text);
    });

    return { ok: true, data: grouped };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message };
  }
}

/**
 * Update a text value
 */
export async function updateTextAction(id: string, value: string) {
  try {
    const { supabase } = await verifyAdmin();

    const { data, error } = await supabase
      .from("system_texts")
      .update({ value })
      .eq("id", id)
      .select("key")
      .single();

    if (error) {
      console.error("[TextsAction] Error updating text:", error);
      return { ok: false, message: error.message };
    }

    // Clear cache for this key
    if (data?.key) {
      clearTextCache(data.key);
    }

    revalidatePath("/admin/texts");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message };
  }
}

/**
 * Reset text to default value
 */
export async function resetTextAction(id: string) {
  try {
    const { supabase } = await verifyAdmin();

    const { data, error } = await supabase
      .from("system_texts")
      .update({ value: null })
      .eq("id", id)
      .select("key")
      .single();

    if (error) {
      console.error("[TextsAction] Error resetting text:", error);
      return { ok: false, message: error.message };
    }

    // Clear cache for this key
    if (data?.key) {
      clearTextCache(data.key);
    }

    revalidatePath("/admin/texts");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message };
  }
}

/**
 * Create a new text entry
 */
export async function createTextAction(payload: {
  key: string;
  page: string;
  default_value: string;
  description?: string;
}) {
  try {
    const { supabase } = await verifyAdmin();

    const { error } = await supabase.from("system_texts").insert({
      key: payload.key,
      page: payload.page,
      default_value: payload.default_value,
      description: payload.description || null,
    });

    if (error) {
      console.error("[TextsAction] Error creating text:", error);
      return { ok: false, message: error.message };
    }

    revalidatePath("/admin/texts");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message };
  }
}

/**
 * Delete a text entry
 */
export async function deleteTextAction(id: string) {
  try {
    const { supabase } = await verifyAdmin();

    const { data, error } = await supabase
      .from("system_texts")
      .delete()
      .eq("id", id)
      .select("key")
      .single();

    if (error) {
      console.error("[TextsAction] Error deleting text:", error);
      return { ok: false, message: error.message };
    }

    // Clear cache for this key
    if (data?.key) {
      clearTextCache(data.key);
    }

    revalidatePath("/admin/texts");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message };
  }
}
