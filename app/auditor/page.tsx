import AuditorHomeClient from "./AuditorHomeClient"
import { Suspense } from "react"

export default function AuditorHomePage() {
  return (
    <main className="min-h-svh bg-[#F7F3EE] px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <Suspense fallback={null}>
          <AuditorHomeClient />
        </Suspense>
      </div>
    </main>
  )
}

