import AuditorScanClient from "./AuditorScanClient"

export default async function AuditorScanPage({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params
  return <AuditorScanClient scanId={scanId} />
}

