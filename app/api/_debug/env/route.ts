export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    DIGITAL_SIGNATURES_ENABLED: process.env.DIGITAL_SIGNATURES_ENABLED,
    SECURE_SIGNATURE_BASE_URL_present: Boolean(process.env.SECURE_SIGNATURE_BASE_URL),
    SECURE_SIGNATURE_API_KEY_present: Boolean(process.env.SECURE_SIGNATURE_API_KEY),
    node_version: process.version,
  });
}
