"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { moveAuditorCheckoutContextToPendingPurchase } from "@/lib/tracking/purchase"

export function AuditorSuccessClient({ basePath }: { basePath: string }) {
  const router = useRouter()

  useEffect(() => {
    moveAuditorCheckoutContextToPendingPurchase()
    router.replace(`${basePath}/dashboard`)
  }, [basePath, router])

  return null
}
