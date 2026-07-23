// Styles for the redesigned split login. Scoped under `.auth-scope.login-split`
// in the stylesheet, and imported only here so it never loads for other pages.
import "../login-split.css"

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
