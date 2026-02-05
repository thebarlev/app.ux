export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Never expose debug env surfaces in production.
  if (process.env.NODE_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }

  // Non-prod: system-admin only.
  const { requireSystemAdmin } = await import("@/lib/security/system-admin");
  try {
    await requireSystemAdmin();
  } catch {
    return new Response("Not Found", { status: 404 });
  }

  return Response.json({
    DIGITAL_SIGNATURES_ENABLED: process.env.DIGITAL_SIGNATURES_ENABLED,
    SECURE_SIGNATURE_BASE_URL_present: Boolean(process.env.SECURE_SIGNATURE_BASE_URL),
    SECURE_SIGNATURE_API_KEY_present: Boolean(process.env.SECURE_SIGNATURE_API_KEY),
    node_version: process.version,
  });
}
