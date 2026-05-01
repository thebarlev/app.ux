export type BillingDocumentType = "invoice_receipt" | "invoice"

export type BillingProviderCustomer = {
  name?: string | null
  email: string
  country: string
}

export type IssueDocumentParams = {
  companyId: string
  documentType: BillingDocumentType
  language: "he" | "en"
  customer: BillingProviderCustomer
  amount: number
  currency: string
  vatRate: number
  vatAmount: number
  totalAmount: number
  metadata?: Record<string, any>
  /**
   * Optional. Persisted on the issued-documents row alongside `provider`
   * — the (provider, idempotency_key) pair is unique in the DB. When
   * present, the calling service is expected to do a pre-flight lookup
   * BEFORE asking the provider to issue, so the provider only sees
   * idempotency keys for which no row exists yet. The provider itself
   * still relies on the unique index as a safety net for race
   * conditions.
   */
  idempotencyKey?: string | null
}

export type IssueDocumentResult =
  | {
      ok: true
      documentId: string
      documentUrl: string | null
      signedPdfBase64?: string | null
      providerJson?: Record<string, any> | null
    }
  | {
      ok: false
      error: string
      status?: number
      providerJson?: Record<string, any> | null
    }

export interface BillingProvider {
  readonly name: string
  issueDocument(params: IssueDocumentParams): Promise<IssueDocumentResult>
}

