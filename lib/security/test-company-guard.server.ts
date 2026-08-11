import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { TestCompanyRefusal, decideTestCompanyRefusal } from "@/lib/security/test-company-guard"

/**
 * The server half of the test-company guard. Import this from routes.
 *
 * Split from the decision function so the decision stays testable in a plain Node
 * context: `server-only` throws the moment it is loaded outside a server bundle, which
 * includes a test runner.
 */

/**
 * Call at the top of any path that sends data outward.
 *
 * `operation` appears in the thrown message and in the log, so make it the name of
 * the thing being refused — "shaam_allocation_request", "bkmv_export" — rather than a
 * function name.
 */
export async function assertNotTestCompany(companyId: string, operation: string): Promise<void> {
  if (!companyId) {
    throw new TestCompanyRefusal("(none)", operation, "no company id supplied")
  }

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from("companies")
    .select("is_test")
    .eq("id", companyId)
    .maybeSingle()

  const refusal = decideTestCompanyRefusal({
    companyId,
    operation,
    row: (data as any) ?? null,
    queryFailed: Boolean(error),
  })

  if (refusal) {
    console.error("[TEST_COMPANY_GUARD] refused", {
      companyId,
      operation,
      reason: refusal.message,
    })
    throw refusal
  }
}
