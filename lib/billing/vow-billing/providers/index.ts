import type { BillingProvider } from "@/lib/billing/vow-billing/providers/types"
import { internalBillingProvider } from "@/lib/billing/vow-billing/providers/internal-provider"

const providers = new Map<string, BillingProvider>()

function normalizeKey(key: string) {
  return String(key || "").toLowerCase().trim()
}

export function registerProvider(provider: BillingProvider) {
  providers.set(normalizeKey(provider.name), provider)
}

export function getProvider(name?: string): BillingProvider {
  const key = normalizeKey(name || "internal")
  return providers.get(key) || internalBillingProvider
}

// Register built-ins (module load)
registerProvider(internalBillingProvider)

