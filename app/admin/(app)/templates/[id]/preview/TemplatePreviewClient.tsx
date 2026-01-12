"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import type { TemplateDefinition } from "@/lib/types/template"

type Props = {
  template: TemplateDefinition
}

export default function TemplatePreviewClient({ template }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isMounted, setIsMounted] = useState(false)

  // Ensure client-side rendering to avoid hydration issues
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Sample data for template preview - BARLEV demo data
  const sampleData = {
    // Company data
    company: {
      name: "BARLEV",
      registration_number: "012345678",
      address: "רחוב הדוגמה 10, מודיעין",
      phone: "054-5215193",
      mobile_phone: "054-5215193",
      email: "info@thebarlev.com",
      website: "https://thebarlev.com",
      logo_url: "/placeholder-logo.png", // Replace with /barlev-logo.png when available
      signature_url: "/placeholder-logo.png",
    },
    
    // Document aliases
    LOGO_URL: "/placeholder-logo.png", // Replace with /barlev-logo.png when available
    USERCOMPANYNAME: "BARLEV",
    USERID: "012345678",
    USERADDRESS: "רחוב הדוגמה 10, מודיעין",
    PHONE: "054-5215193",
    MOBILE: "054-5215193",
    EMAIL: "info@thebarlev.com",
    DOMAIN: "https://thebarlev.com",
    SIGNATURE_URL: "/placeholder-logo.png",
    
    // Customer data
    customer: {
      name: "ישראל ישראלי",
      tax_id: "987654321",
      phone: "050-0000000",
      email: "customer@example.com",
      address: "רחוב הלקוח 5, תל אביב",
    },
    
    // Customer aliases
    CLIENTNAME: "ישראל ישראלי",
    BUSINESSID: "987654321",
    CLIENTPHONE: "050-0000000",
    CLIENTADDRESS: "רחוב הלקוח 5, תל אביב",
    
    // Document data
    document: {
      number: "152",
      date: "29.12.2025",
      subtitle: "קבלה על תשלום",
      description: "תשלום עבור שירותים",
      notes: "תודה על הקנייה",
      footer_notes: "מסמך זה הופק באופן אוטומטי",
    },
    
    // Document aliases
    RECEIPTNUMBER: "152",
    previewNumber: "152",
    documentDate: "29.12.2025",
    Datecreation: "29.12.2025",
    currentTime: "15:10",
    DOC_SUBTITLE: "קבלה על תשלום",
    DESCRIPTION: "תשלום עבור שירותים",
    description: "תשלום עבור שירותים",
    NOTES: "תודה על הקנייה",
    notes: "תודה על הקנייה",
    FOOTER_TEXT: "מסמך זה הופק באופן אוטומטי",
    footerNotes: "מסמך זה הופק באופן אוטומטי",
    FOOTER_META: "נוצר ב-29.12.2025 15:10",
    
    // Financial data
    subtotal: 111,
    total: 177,
    currency: "₪",
    
    // Financial aliases
    TOTAL: "₪ 177",
    formattedTotal: "₪ 177",
    SUBTOTAL: "₪ 111",
    TAX: "₪ 66",
    
    // Payment data
    payments: [
      {
        method: "בנק",
        date: "29.12.2025",
        formattedDate: "29.12.2025",
        amount: 111,
        formattedAmount: "₪ 111",
        currency: "₪",
        bankName: "בנק הפועלים",
        branch: "765",
        bankBranch: "765",
        accountNumber: "00004999",
        bankAccount: "00004999",
        description: "12 שיקים / מסי חשבון 765 / עסקה 0000004999",
      },
      {
        method: "ביטוי בכרטיס",
        date: "29.12.2025",
        formattedDate: "29.12.2025",
        amount: 66,
        formattedAmount: "₪ 66",
        currency: "₪",
        description: "ביטוי בכרטיס אשראי",
      },
    ],
    
    // Payment aliases for first payment
    PAYMENT_METHOD: "בנק",
    PAYMENT_DATE: "29.12.2025",
    PAYMENT_AMOUNT: "₪ 111",
    PAYMENT_DESC: "12 שיקים / מסי חשבון 765 / עסקה 0000004999",
    hasPayments: true,
  }

  const processTemplate = (html: string) => {
    let processed = html

    // 1. Handle loops: {{#each payments}}...{{/each}}
    processed = processed.replace(
      /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (match, arrayName, template) => {
        const array = (sampleData as any)[arrayName]
        if (!Array.isArray(array)) return ""

        return array
          .map((item: any, idx: number) => {
            let itemHtml = template

            // Handle nested conditionals
            itemHtml = itemHtml.replace(
              /\{\{#if\s+this\.(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
              (m, prop, content) => {
                return item[prop] ? content : ""
              }
            )

            // Replace {{this.prop}}
            itemHtml = itemHtml.replace(
              /\{\{\s*this\.(\w+)\s*\}\}/g,
              (m, prop) => {
                const value = item[prop]
                return value !== undefined && value !== null ? String(value) : ""
              }
            )

            // Replace {{@index}}
            itemHtml = itemHtml.replace(/\{\{\s*@index\s*\}\}/g, String(idx))

            return itemHtml
          })
          .join("")
      }
    )

    // 2. Handle conditionals: {{#if var}}...{{/if}}
    processed = processed.replace(
      /\{\{#if\s+([^\}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (match, expr, content) => {
        const path = expr.trim()
        const value = path
          .split(".")
          .reduce((obj: any, key: string) => obj?.[key], sampleData)
        return value ? content : ""
      }
    )

    // 3. Replace variables: {{var}} or {{user.name}}
    processed = processed.replace(
      /\{\{\s*([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)\s*\}\}/g,
      (match, path) => {
        const value = path
          .split(".")
          .reduce((obj: any, key: string) => obj?.[key], sampleData)
        
        if (value === undefined || value === null) {
          return ""
        }
        
        return String(value)
      }
    )

    return processed
  }

  // Show loading state until client-side
  if (!isMounted) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-center">טוען...</p>
        </div>
      </div>
    )
  }

  const requestedLangParam = searchParams.get("lang")
  const requestedLang = requestedLangParam === "en" ? "en" : "he"

  const heHtml = template.html_he || template.html_template || ""
  const heCss = template.css_he || template.css || ""
  const enHtml = template.html_en || ""
  const enCss = template.css_en || ""

  const canUseEn = !!enHtml?.trim()
  const effectiveLang = requestedLang === "en" && canUseEn ? "en" : "he"
  const didFallback = requestedLang === "en" && effectiveLang === "he"

  const html = effectiveLang === "en" ? enHtml : heHtml
  const css = effectiveLang === "en" ? enCss : heCss
  const processedHtml = processTemplate(html)

  return (
    <div className="min-h-screen bg-gray-100 p-8" dir={effectiveLang === "en" ? "ltr" : "rtl"}>
      <div className="max-w-[210mm] mx-auto space-y-6">
        {/* Header - sticky toolbar */}
        <div className="sticky top-0 z-50 bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">תצוגה לדוגמה</h1>
              <p className="text-sm text-gray-600 mt-1">{template.name}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => window.close()}
            >
              <ArrowRight className="h-4 w-4 ml-2" />
              סגור
            </Button>
          </div>
        </div>

        {didFallback && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
            חסרה תבנית באנגלית (html_en/css_en). התצוגה מוצגת בעברית (fallback) לצרכי preview בלבד.
          </div>
        )}

        {/* Preview Container - A4 paper simulation */}
        <div className="bg-white rounded-lg shadow-2xl overflow-hidden" style={{
          width: "210mm",
          minHeight: "297mm",
          margin: "0 auto",
        }}>
          <style dangerouslySetInnerHTML={{ __html: css }} />
          <div
            className="p-8"
            dangerouslySetInnerHTML={{ __html: processedHtml }}
          />
        </div>

        {/* Footer info */}
        <div className="text-center text-sm text-gray-500 pb-8">
          <p>תצוגה לדוגמה עם נתונים סטטיים • לא ניתן להדפיס ישירות מכאן</p>
        </div>
      </div>
    </div>
  )
}
