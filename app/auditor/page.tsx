import AuditorHomeClient from "./AuditorHomeClient"
import { Suspense } from "react"

export default function AuditorHomePage() {
  return (
    <Suspense fallback={null}>
      <AuditorHomeClient />
    </Suspense>
  )
}

