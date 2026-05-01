export type VowBillingLanguage = "he" | "en"

export type VowBillingCreateDocumentInput = {
  user_id: string
  email: string
  country: string
  amount: number
  currency: string
  language: VowBillingLanguage
  is_israeli: boolean
  /**
   * Optional caller-supplied idempotency key. When provided, the
   * issuer guarantees that two calls with the same key+provider
   * return the same document (no duplicate billing). Use a stable
   * value like `mioshy:<deal_number>`.
   */
  idempotency_key?: string
}

export type VowBillingCreateDocumentResult =
  | {
      success: true
      document_url: string | null
      document_id: string
    }
  | {
      success: false
      message: string
      code?: string
    }

