export function applyCompanyWhere(q: any, companyId: string | null | undefined) {
  return companyId ? q.eq("company_id", companyId) : q.is("company_id", null)
}

export function applyScanWhere(
  q: any,
  scanId: string,
  companyId: string | null | undefined
) {
  let out = q.eq("id", scanId)
  out = applyCompanyWhere(out, companyId)
  return out
}

