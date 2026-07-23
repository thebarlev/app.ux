import "./auth.css"
// Shared split-layout styles for the redesigned product auth pages (login,
// register, forgot). Everything is scoped under `.auth-scope.login-split`, so
// pages that don't opt in (register4, reset-password, auditor) are untouched.
import "./login-split.css"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}

