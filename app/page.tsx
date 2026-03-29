import type { Metadata } from "next"
import { HomeLanding } from "@/components/home/HomeLanding"

export const metadata: Metadata = {
  alternates: {
    canonical: "https://app.uxellent.com",
  },
  openGraph: {
    url: "https://app.uxellent.com",
  },
}

export default function Page() {
  return <HomeLanding />
}
