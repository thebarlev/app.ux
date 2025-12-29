import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateReceiptPDF } from "@/lib/pdf-generator";
import { getCompanyIdForUser } from "@/lib/document-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const receiptId = params.id;
    const supabase = await createClient();

    // Authenticate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's company ID
    const companyId = await getCompanyIdForUser();

    // Fetch receipt data with company verification
    const { data: receipt, error } = await supabase
      .from("documents")
      .select(`
        id,
        document_number,
        document_status,
        issue_date,
        customer_name,
        total_amount,
        currency,
        internal_notes,
        customer_notes,
        company_id,
        subtotal,
        vat_amount
      `)
      .eq("id", receiptId)
      .eq("company_id", companyId)
      .eq("document_type", "receipt")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    // Only allow PDF generation for final receipts
    if (receipt.document_status !== "final") {
      return NextResponse.json(
        { error: "PDF can only be generated for final receipts" },
        { status: 400 }
      );
    }

    // Get company details including logo
    const { data: company } = await supabase
      .from("companies")
      .select("company_name, logo_url, business_type, registration_number, address, phone, mobile_phone, email, website")
      .eq("id", companyId)
      .maybeSingle();

    // Fetch payment line items from document_line_items
    const { data: lineItems } = await supabase
      .from("document_line_items")
      .select("*")
      .eq("document_id", receiptId)
      .order("line_number", { ascending: true });

    // Convert line items to payments array
    const payments = lineItems && lineItems.length > 0 
      ? lineItems.map((item: any) => ({
          method: item.description || "תשלום",
          date: item.created_at ? new Date(item.created_at).toISOString().split("T")[0] : (receipt.issue_date || new Date().toISOString().split("T")[0]),
          amount: item.line_total || 0,
          currency: receipt.currency || "₪",
        }))
      : [{
          method: "תשלום",
          date: receipt.issue_date || new Date().toISOString().split("T")[0],
          amount: receipt.total_amount || 0,
          currency: receipt.currency || "₪",
        }];

    // Generate PDF
    const pdfDoc = generateReceiptPDF({
      documentNumber: receipt.document_number || "DRAFT",
      issueDate: receipt.issue_date || new Date().toISOString().split("T")[0],
      customerName: receipt.customer_name || "N/A",
      companyName: company?.company_name || "My Business",
      companyDetails: company ? {
        businessType: company.business_type || undefined,
        registrationNumber: company.registration_number || undefined,
        address: company.address || undefined,
        phone: company.phone || undefined,
        mobile: company.mobile_phone || undefined,
        email: company.email || undefined,
        website: company.website || undefined,
        logoUrl: company.logo_url || undefined,
      } : undefined,
      total: receipt.total_amount || 0,
      currency: receipt.currency || "₪",
      payments,
      notes: receipt.internal_notes || undefined,
      footerNotes: receipt.customer_notes || undefined,
    });

    // Convert PDF to buffer
    const pdfArrayBuffer = pdfDoc.output("arraybuffer");
    const pdfBuffer = Buffer.from(pdfArrayBuffer);

    // Return PDF as downloadable file
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${receipt.document_number}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: any) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
