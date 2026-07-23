"use client"

import { Suspense } from "react"
import { LoginForm } from "@/components/auth/LoginForm"

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm
        afterLoginRedirectTo="/dashboard"
        registerHref="/register"
        variant="split"
        titleText="התחברות"
        descriptionText="היכנס לניהול המסמכים של העסק · חשבונית דיגיטלית"
      />
    </Suspense>
  )
}

