import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "תצוגה לדוגמה - תבנית",
  description: "תצוגה לדוגמה של תבנית מסמך",
}

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
