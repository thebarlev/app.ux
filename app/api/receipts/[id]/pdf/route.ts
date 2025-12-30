import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateReceiptPDF } from "@/lib/pdf-generator";
import { getCompanyIdForUser } from "@/lib/document-helpers";

// Force Node.js runtime for PDF generation (required for jsPDF)
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Await params in Next.js 16
    const params = await context.params;
    const receiptId = params.id;
    console.log("[PDF] Starting PDF generation for receipt:", receiptId);
    
    const supabase = await createClient();

    // Authenticate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("[PDF] User not authenticated");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log("[PDF] User authenticated:", user.id);

    // Get user's company ID
    const companyId = await getCompanyIdForUser();
    console.log("[PDF] Company ID:", companyId);

    // Fetch receipt data with company verification
    const { data: receipt, error } = await supabase
      .from("documents")
      .select(`
        id,
        document_number,
        document_status,
        issue_date,
        customer_name,
        customer_id,
        document_description,
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
      console.error("[PDF] Database error fetching receipt:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!receipt) {
      console.error("[PDF] Receipt not found:", receiptId);
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    console.log("[PDF] Receipt found:", receipt.document_number, "Status:", receipt.document_status);

    // Only allow PDF generation for final receipts
    if (receipt.document_status !== "final") {
      console.error("[PDF] Receipt is not final:", receipt.document_status);
      return NextResponse.json(
        { error: "PDF can only be generated for final receipts" },
        { status: 400 }
      );
    }

    // Get customer details if customer_id exists
    let customerDetails = null;
    if (receipt.customer_id) {
      console.log("[PDF] Fetching customer details:", receipt.customer_id);
      const { data: customer } = await supabase
        .from("customers")
        .select("name, email, phone, mobile, address_street, address_city, address_zip")
        .eq("id", receipt.customer_id)
        .maybeSingle();
      
      customerDetails = customer;
      console.log("[PDF] Customer details:", customerDetails ? "found" : "not found");
    }

    // Get company details including logo
    console.log("[PDF] Fetching company details");
    const { data: company } = await supabase
      .from("companies")
      .select("company_name, logo_url, business_type, registration_number, address, phone, mobile_phone, email, website")
      .eq("id", companyId)
      .maybeSingle();
    console.log("[PDF] Company details:", company ? company.company_name : "not found");

    // Fetch payment line items - these represent individual payments (קבלות)
    console.log("[PDF] Fetching line items (payments)");
    const { data: lineItems } = await supabase
      .from("document_line_items")
      .select("description, item_date, unit_price, quantity, line_total, currency, bank_name, branch, account_number")
      .eq("document_id", receiptId)
      .order("line_number", { ascending: true });
    console.log("[PDF] Line items (payments) count:", lineItems?.length || 0);

    // Convert line items to payments array
    // Each line item represents a payment method
    const payments = lineItems && lineItems.length > 0 
      ? lineItems.map((item: any) => ({
          method: item.description || "תשלום", // Payment method (e.g., "Bit", "העברה בנקאית")
          date: item.item_date || receipt.issue_date || new Date().toISOString().split("T")[0],
          amount: item.line_total || item.unit_price || 0,
          currency: item.currency || receipt.currency || "₪",
          bankName: item.bank_name || undefined,
          branch: item.branch || undefined,
          accountNumber: item.account_number || undefined,
        }))
      : [{
          method: "תשלום",
          date: receipt.issue_date || new Date().toISOString().split("T")[0],
          amount: receipt.total_amount || 0,
          currency: receipt.currency || "₪",
        }];

    console.log("[PDF] Generating PDF document...");
    
    // Generate PDF
    const pdfDoc = await generateReceiptPDF({
      documentNumber: receipt.document_number || "DRAFT",
      issueDate: receipt.issue_date || new Date().toISOString().split("T")[0],
      customerName: receipt.customer_name || "N/A",
      customerDetails: customerDetails ? {
        email: customerDetails.email || undefined,
        phone: customerDetails.phone || undefined,
        mobile: customerDetails.mobile || undefined,
        address: customerDetails.address_street 
          ? `${customerDetails.address_street}${customerDetails.address_city ? ', ' + customerDetails.address_city : ''}`
          : undefined,
      } : undefined,
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
      description: receipt.document_description || undefined,
      notes: receipt.internal_notes || undefined,
      footerNotes: receipt.customer_notes || undefined,
    });

    console.log("[PDF] PDF document object created, converting to buffer...");

    // Generate PDF as ArrayBuffer (most reliable for binary data)
    const pdfArrayBuffer = pdfDoc.output("arraybuffer") as ArrayBuffer;
    
    // Convert ArrayBuffer to Buffer properly
    const pdfBuffer = Buffer.from(pdfArrayBuffer);
    
    // Verify buffer is not empty
    if (pdfBuffer.length === 0) {
      console.error("[PDF] PDF buffer is empty!");
      return NextResponse.json(
        { error: "Generated PDF is empty" },
        { status: 500 }
      );
    }

    console.log(`[PDF] Generated PDF size: ${pdfBuffer.length} bytes`);

    // Return PDF as downloadable file with proper headers
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${receipt.document_number}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
        "Cache-Control": "no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error: any) {
    console.error("[PDF] PDF generation error:", error);
    console.error("[PDF] Error stack:", error.stack);
    return NextResponse.json(
      { error: error.message || "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
