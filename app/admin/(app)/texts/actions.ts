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

    // Group by page, then by key (two langs: he/en)
    type Row = {
      id: string;
      key: string;
      page: string;
      lang: "he" | "en";
      default_value: string;
      value: string | null;
      description: string | null;
      updated_at: string;
    };

    type Entry = {
      key: string;
      page: string;
      description: string | null;
      updated_at: string;
      he?: Pick<Row, "id" | "default_value" | "value">;
      en?: Pick<Row, "id" | "default_value" | "value">;
    };

    const grouped: Record<string, Entry[]> = {};
    const byPageAndKey = new Map<string, Entry>();

    (data as Row[] | null)?.forEach((row) => {
      const page = row.page;
      const mapKey = `${row.page}::${row.key}`;

      const existing =
        byPageAndKey.get(mapKey) ||
        ({
          key: row.key,
          page: row.page,
          description: row.description || null,
          updated_at: row.updated_at,
        } as Entry);

      existing.description = existing.description || row.description || null;
      existing.updated_at = row.updated_at || existing.updated_at;

      if (row.lang === "he") existing.he = { id: row.id, default_value: row.default_value, value: row.value };
      if (row.lang === "en") existing.en = { id: row.id, default_value: row.default_value, value: row.value };

      byPageAndKey.set(mapKey, existing);
      if (!grouped[page]) grouped[page] = [];
    });

    // Materialize arrays per page in key order
    for (const entry of byPageAndKey.values()) {
      grouped[entry.page].push(entry);
    }
    Object.keys(grouped).forEach((p) => {
      grouped[p].sort((a, b) => a.key.localeCompare(b.key));
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
export async function updateTextAction(payload: { key: string; page: string; lang: "he" | "en"; value: string }) {
  try {
    const { supabase } = await verifyAdmin();

    // First, fetch existing row to get default_value (required for upsert)
    const { data: existing, error: fetchError } = await supabase
      .from("system_texts")
      .select("default_value, description")
      .eq("key", payload.key)
      .eq("page", payload.page)
      .eq("lang", payload.lang)
      .maybeSingle();

    if (fetchError && fetchError.code !== "PGRST116") {
      // PGRST116 = not found, which is OK for new records
      console.error("[TextsAction] Error fetching existing text:", fetchError);
      return { ok: false, message: `Error fetching existing text: ${fetchError.message}` };
    }

    // For updates: use existing default_value. For new records: require default_value to be provided.
    // Since we're only updating existing records here, use existing default_value or fallback
    const defaultValue = existing?.default_value || "";

    if (!existing && !defaultValue) {
      // New record without default_value - this shouldn't happen in normal flow
      return { ok: false, message: "Cannot update: text entry does not exist. Please create it first." };
    }

    // Update only the value field (not default_value or description)
    const { error } = await supabase
      .from("system_texts")
      .update({ value: payload.value })
      .eq("key", payload.key)
      .eq("page", payload.page)
      .eq("lang", payload.lang);

    if (error) {
      console.error("[TextsAction] Error updating text:", error);
      return { ok: false, message: error.message };
    }

    // Clear cache (lang aware cache is internal; safest is full clear)
    clearTextCache();

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
export async function resetTextAction(payload: { key: string; page: string; lang: "he" | "en" }) {
  try {
    const { supabase } = await verifyAdmin();

    const { error } = await supabase
      .from("system_texts")
      .update({ value: null })
      .eq("key", payload.key)
      .eq("page", payload.page)
      .eq("lang", payload.lang);

    if (error) {
      console.error("[TextsAction] Error resetting text:", error);
      return { ok: false, message: error.message };
    }

    clearTextCache();

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
  default_value_he: string;
  default_value_en: string;
  description?: string;
}) {
  try {
    const { supabase } = await verifyAdmin();

    const { error } = await supabase.from("system_texts").insert([
      {
        key: payload.key,
        page: payload.page,
        lang: "he",
        default_value: payload.default_value_he,
        description: payload.description || null,
      },
      {
        key: payload.key,
        page: payload.page,
        lang: "en",
        default_value: payload.default_value_en,
        description: payload.description || null,
      },
    ]);

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
export async function deleteTextAction(payload: { key: string; page: string }) {
  try {
    const { supabase } = await verifyAdmin();

    const { error } = await supabase
      .from("system_texts")
      .delete()
      .eq("key", payload.key)
      .eq("page", payload.page);

    if (error) {
      console.error("[TextsAction] Error deleting text:", error);
      return { ok: false, message: error.message };
    }

    clearTextCache();

    revalidatePath("/admin/texts");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message };
  }
}
