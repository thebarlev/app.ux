export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.SHAAM_DEBUG !== "true") {
    return new Response(
      JSON.stringify({ ok: false, error: "disabled" }),
      { status: 404, headers: { "content-type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      ts: new Date().toISOString(),
      runtime: "nodejs",
      node: process.version,
      vercelRegion: process.env.VERCEL_REGION ?? null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      hasProxyEnv: {
        HTTP_PROXY: !!process.env.HTTP_PROXY,
        HTTPS_PROXY: !!process.env.HTTPS_PROXY,
        NO_PROXY: !!process.env.NO_PROXY,
      },
    }),
    { headers: { "content-type": "application/json" } }
  );
}