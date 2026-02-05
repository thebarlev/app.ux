import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/security/rate-limit"

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = rateLimit({ key: `export-data:${ip}`, limit: 10, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) })
  }

  const supabase = await createClient()

  // Verify admin authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: adminData } = await supabase.from("system_admins").select("id").eq("auth_user_id", user.id).single()

  if (!adminData) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Parse filters from query params
  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get("dateFrom")
  const dateTo = searchParams.get("dateTo")
  const month = searchParams.get("month")
  const year = searchParams.get("year")

  // Build companies query
  let companiesQuery = supabase.from("companies").select("*").order("created_at", { ascending: false })

  // Apply date range filter
  if (dateFrom) {
    companiesQuery = companiesQuery.gte("created_at", dateFrom)
  }
  if (dateTo) {
    companiesQuery = companiesQuery.lte("created_at", `${dateTo}T23:59:59`)
  }

  // Apply month/year filter
  if (month && year) {
    const startOfMonth = new Date(Number.parseInt(year), Number.parseInt(month) - 1, 1)
    const endOfMonth = new Date(Number.parseInt(year), Number.parseInt(month), 0, 23, 59, 59)
    companiesQuery = companiesQuery
      .gte("created_at", startOfMonth.toISOString())
      .lte("created_at", endOfMonth.toISOString())
  } else if (year && !month) {
    const startOfYear = new Date(Number.parseInt(year), 0, 1)
    const endOfYear = new Date(Number.parseInt(year), 11, 31, 23, 59, 59)
    companiesQuery = companiesQuery
      .gte("created_at", startOfYear.toISOString())
      .lte("created_at", endOfYear.toISOString())
  }

  const { data: companies, error: companiesError } = await companiesQuery

  if (companiesError) {
    console.error("[EXPORT_DATA] companies query failed", companiesError)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }

  // Fetch all documents
  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false })

  if (documentsError) {
    console.error("[EXPORT_DATA] documents query failed", documentsError)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
  const docCount = documents?.length || 0
  const docsWithCopyKey = (documents || []).filter((d: any) => !!d.pdf_storage_key_he_copy).length
  const docsWithEnKey = (documents || []).filter((d: any) => !!d.pdf_storage_key_en).length

  // Fetch global settings for VAT
  const { data: settings } = await supabase.from("global_settings").select("*").eq("setting_key", "vat_rate").single()

  const vatRate = settings?.setting_value || "17"

  // Process data for export
  const exportData = (companies || []).map((company) => {
    const companyDocs = (documents || []).filter((d) => d.company_id === company.id)

    // Count by document type
    const invoices = companyDocs.filter((d) => d.document_type === "tax_invoice")
    const receipts = companyDocs.filter((d) => d.document_type === "receipt")
    const creditNotes = companyDocs.filter((d) => d.document_type === "credit_invoice")
    const quotes = companyDocs.filter((d) => d.document_type === "quote")
    const deliveryNotes = companyDocs.filter((d) => d.document_type === "delivery_note")
    const invoiceReceipts = companyDocs.filter((d) => d.document_type === "invoice_receipt")

    // Calculate totals
    const totalInvoiceAmount = invoices.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
    const totalReceiptsAmount = receipts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
    const totalCreditAmount = creditNotes.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
    const totalQuotesAmount = quotes.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)

    // Revenue calculations
    const grossRevenue = totalInvoiceAmount + totalReceiptsAmount
    const netRevenue = grossRevenue - totalCreditAmount
    const vatAmount = netRevenue * (Number.parseFloat(vatRate) / 100)

    return {
      // Company Info
      "Company ID": company.id,
      "Company Name": company.company_name,
      "Business Type": company.business_type || "N/A",
      "Tax ID": company.tax_id || "N/A",
      Status: company.status,

      // Contact Info
      "Contact Name": company.contact_full_name,
      "Contact First Name": company.contact_first_name,
      Email: company.email,
      "Mobile Phone": company.mobile_phone || "N/A",

      // Dates
      "Registration Date": company.created_at ? new Date(company.created_at).toLocaleDateString() : "N/A",
      "Last Login": company.last_login_at ? new Date(company.last_login_at).toLocaleDateString() : "Never",

      // Document Counts
      "Total Documents": companyDocs.length,
      "Tax Invoices": invoices.length,
      "Invoice Receipts": invoiceReceipts.length,
      Receipts: receipts.length,
      "Credit Notes": creditNotes.length,
      Quotes: quotes.length,
      "Delivery Notes": deliveryNotes.length,

      // Financial Data
      "Total Invoice Amount": totalInvoiceAmount.toFixed(2),
      "Total Receipts Amount": totalReceiptsAmount.toFixed(2),
      "Total Credits Amount": totalCreditAmount.toFixed(2),
      "Total Quotes Amount": totalQuotesAmount.toFixed(2),

      // Revenue Calculations
      "Gross Revenue": grossRevenue.toFixed(2),
      "Net Revenue": netRevenue.toFixed(2),
      "VAT Percentage": `${vatRate}%`,
      "VAT Amount (Estimated)": vatAmount.toFixed(2),

      // Activity Metrics
      "Total Actions": companyDocs.length,
      "Goal Marked Documents": companyDocs.filter((d) => d.is_goal_marked).length,

      // Placeholders for future PDF integrations
      "PDF Revenue (Placeholder)": "N/A",
      "PDF Tax Report (Placeholder)": "N/A",
    }
  })

  // Create workbook
  const workbook = XLSX.utils.book_new()

  // Companies & Activity Sheet
  const companiesSheet = XLSX.utils.json_to_sheet(exportData)
  XLSX.utils.book_append_sheet(workbook, companiesSheet, "Companies & Activity")

  // Documents Detail Sheet
  const baseUrl = new URL(request.url).origin
  const docsData = (documents || []).map((doc) => {
    const company = (companies || []).find((c) => c.id === doc.company_id)
    const copyLink = doc.pdf_storage_key_he_copy
      ? `${baseUrl}/api/documents/${doc.id}/pdf?lang=he&issue=copy`
      : ""
    const enLink = doc.pdf_storage_key_en
      ? `${baseUrl}/api/documents/${doc.id}/pdf?lang=en&issue=copy`
      : ""
    return {
      "Document ID": doc.id,
      "Document Number": doc.document_number,
      Company: company?.company_name || "Unknown",
      Type: doc.document_type,
      Amount: Number(doc.amount || 0).toFixed(2),
      Status: doc.status,
      "Issue Date": doc.issue_date ? new Date(doc.issue_date).toLocaleDateString() : "N/A",
      "Created At": doc.created_at ? new Date(doc.created_at).toLocaleDateString() : "N/A",
      "Is Goal Marked": doc.is_goal_marked ? "Yes" : "No",
      "Copy PDF Storage Key": doc.pdf_storage_key_he_copy || "",
      "Copy PDF Link": copyLink,
      "English PDF Storage Key": doc.pdf_storage_key_en || "",
      "English PDF Link": enLink,
    }
  })

  if (docsData.length > 0) {
    const docsSheet = XLSX.utils.json_to_sheet(docsData)
    XLSX.utils.book_append_sheet(workbook, docsSheet, "Documents Detail")
  }

  // Summary Sheet
  const totalCompanies = (companies || []).length
  const activeCompanies = (companies || []).filter((c) => c.status === "active").length
  const suspendedCompanies = (companies || []).filter((c) => c.status === "suspended").length
  const totalDocs = (documents || []).length
  const totalRevenue = exportData.reduce((sum, row) => sum + Number.parseFloat(row["Gross Revenue"]), 0)

  const summaryData = [
    { Metric: "Total Companies", Value: totalCompanies },
    { Metric: "Active Companies", Value: activeCompanies },
    { Metric: "Suspended Companies", Value: suspendedCompanies },
    { Metric: "Total Documents", Value: totalDocs },
    { Metric: "Total Gross Revenue", Value: totalRevenue.toFixed(2) },
    { Metric: "VAT Rate", Value: `${vatRate}%` },
    { Metric: "Export Date", Value: new Date().toLocaleString() },
    { Metric: "Filters Applied", Value: dateFrom || dateTo || month || year ? "Yes" : "No" },
  ]

  const summarySheet = XLSX.utils.json_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary")

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })

  // Return file
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="system-export-${new Date().toISOString().split("T")[0]}.xlsx"`,
    },
  })
}
