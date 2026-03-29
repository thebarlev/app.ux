import type { Metadata } from "next"
import { HomeLanding } from "@/components/home/HomeLanding"

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
  },
}

export default function Page() {
  return <HomeLanding />
}
