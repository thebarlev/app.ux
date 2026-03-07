export default function EnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="en" dir="ltr" className="min-h-svh">
      {children}
    </div>
  )
}
