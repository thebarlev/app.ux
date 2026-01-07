"use client"

import dynamic from "next/dynamic"
import type { ReceiptStyleSettings } from "@/lib/types/receipt-style"

const PreviewClient = dynamic(() => import("./PreviewClient"), {
  ssr: false,
})

type CustomerData = {
  name: string
  email?: string
  phone?: string
  mobile?: string
  address_street?: string
  address_city?: string
  address_zip?: string
  tax_exempt?: boolean
  tax_id?: string
} | null

type CompanyData = {
  company_name: string
  business_type?: string
  registration_number?: string
  company_number?: string
  address?: string
  street?: string
  city?: string
  postal_code?: string
  phone?: string
  mobile_phone?: string
  email?: string
  website?: string
  logo_url?: string
  signature_url?: string
} | null

type Props = {
  customerData: CustomerData
  companyData: CompanyData
  styleSettings: ReceiptStyleSettings
  templateHtml: string | null
  templateCss: string | null
}

export default function PreviewWrapper(props: Props) {
  return <PreviewClient {...props} />
}
