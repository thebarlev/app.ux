import type { IndexExtractorAdapter } from "@/lib/admin/index-extractor/types"
import { genericAdapter } from "@/lib/admin/index-extractor/adapters/generic"

const adapters: IndexExtractorAdapter[] = [genericAdapter]

export function getAdapterForHostname(hostname: string): IndexExtractorAdapter {
  const h = hostname.toLowerCase()
  return adapters.find((adapter) => adapter.match(h)) || genericAdapter
}
