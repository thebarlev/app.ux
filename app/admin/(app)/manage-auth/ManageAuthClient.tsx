"use client"

import { useFormState, useFormStatus } from "react-dom"
import { setAdminPasswordAction, updateAdminAuthAction, type ManageAuthActionState } from "./actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

function SubmitButton(props: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : props.label}
    </Button>
  )
}

const initialState: ManageAuthActionState = { ok: false, message: "" }

export default function ManageAuthClient(props: { currentEmail: string }) {
  const [emailState, emailAction] = useFormState(updateAdminAuthAction, initialState)
  const [pwState, pwAction] = useFormState(setAdminPasswordAction, initialState)

  return (
    <div className="max-w-2xl" dir="rtl">
      <Card className="border border-border bg-card">
        <CardHeader className="p-6">
          <CardTitle className="text-xl font-semibold text-fg">ניהול התחברות אדמין</CardTitle>
          <CardDescription className="text-sm text-muted-fg">
            עדכון אימייל או סיסמה של משתמש האדמין המחובר ב-Supabase Auth.
          </CardDescription>
          {props.currentEmail ? (
            <div className="mt-3 text-sm text-muted-fg">
              אימייל נוכחי: <span className="font-medium text-fg">{props.currentEmail}</span>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-10">
          <form action={emailAction} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">אימייל חדש (אופציונלי)</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="name@company.com"
                autoComplete="email"
                dir="ltr"
              />
              <div className="text-xs text-muted-fg">אם תמלא אימייל – הוא יסומן כמאומת (email_confirm=true).</div>
            </div>

            {emailState?.message ? (
              <div
                className={`rounded-md border px-4 py-3 text-sm ${
                  emailState.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
                role="status"
              >
                {emailState.message}
              </div>
            ) : null}

            <div className="flex items-center justify-start gap-3">
              <SubmitButton label="עדכון אימייל" />
            </div>
          </form>

          <div className="h-px w-full bg-border" />

          <form action={pwAction} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="new_password">סיסמה חדשה</Label>
              <Input
                id="new_password"
                name="password"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                dir="ltr"
              />
              <div className="text-xs text-muted-fg">מינימום 8 תווים.</div>
            </div>

            {pwState?.message ? (
              <div
                className={`rounded-md border px-4 py-3 text-sm ${
                  pwState.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"
                }`}
                role="status"
              >
                {pwState.message}
              </div>
            ) : null}

            <div className="flex items-center justify-start gap-3">
              <SubmitButton label="עדכון סיסמה" />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

