export function getAdminAuditorCompanyId(): string {
  const id = process.env.ADMIN_AUDITOR_COMPANY_ID?.trim()
  if (!id) {
    throw new Error("ADMIN_AUDITOR_COMPANY_ID must be set for admin auditor routes")
  }
  return id
}
