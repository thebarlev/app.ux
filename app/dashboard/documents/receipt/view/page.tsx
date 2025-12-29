import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyIdForUser } from "@/lib/document-helpers";
import ReceiptViewClient from "./ReceiptViewClient";

type PageProps = {
  searchParams: Promise<{
    id?: string;
  }>;
};

export default async function ReceiptViewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const receiptId = params.id;

  if (!receiptId) {
    redirect("/dashboard/documents/receipts");
  }

  const supabase = await createClient();
  const companyId = await getCompanyIdForUser();

  // Fetch the receipt with company isolation
  const { data: receipt, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", receiptId)
    .eq("company_id", companyId)
    .eq("document_type", "receipt")
    .maybeSingle();

  if (error || !receipt) {
    redirect("/dashboard/documents/receipts");
  }

  // Fetch company info with all details
  const { data: company } = await supabase
    .from("companies")
    .select("company_name, logo_url, business_type, registration_number, address, phone, mobile_phone, email, website")
    .eq("id", companyId)
    .single();

  return (
    <ReceiptViewClient 
      receipt={receipt}
      companyName={company?.company_name || "העסק שלי"}
      companyDetails={{
        logoUrl: company?.logo_url || undefined,
        businessType: company?.business_type || undefined,
        registrationNumber: company?.registration_number || undefined,
        address: company?.address || undefined,
        phone: company?.phone || undefined,
        mobile: company?.mobile_phone || undefined,
        email: company?.email || undefined,
        website: company?.website || undefined,
      }}
    />
  );
}
