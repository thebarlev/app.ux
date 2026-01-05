import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReceiptStyleSettings } from "./actions";
import ReceiptStyleForm from "./ReceiptStyleForm";
import { DEFAULT_RECEIPT_STYLE } from "@/lib/types/receipt-style";

export default async function ReceiptStylePage() {
  const supabase = await createClient();

  // Check admin access
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/admin/login");
  }

  const { data: adminData } = await supabase
    .from("system_admins")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!adminData) {
    redirect("/dashboard");
  }

  // Get current settings
  const result = await getReceiptStyleSettings();
  const settings = result.ok && result.settings ? result.settings : DEFAULT_RECEIPT_STYLE;

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 py-8 px-4">
      <ReceiptStyleForm initialSettings={settings} />
    </div>
  );
}
