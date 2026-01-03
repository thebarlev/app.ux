"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Shield, Loader2 } from "lucide-react"

export default function AdminLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const errorParam = searchParams.get("error")
    if (errorParam === "unauthorized") {
      setError("You do not have permission to access the admin panel.")
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError("Invalid email or password")
        setIsLoading(false)
        return
      }

      if (!data.user) {
        setError("Login failed. Please try again.")
        setIsLoading(false)
        return
      }

      const { data: adminData, error: adminError } = await supabase
        .from("system_admins")
        .select("id, role, email, name")
        .eq("auth_user_id", data.user.id)
        .single()

      if (adminError || !adminData) {
        await supabase.auth.signOut()
        setError("You do not have admin permissions")
        setIsLoading(false)
        return
      }

      router.push("/admin")
      router.refresh()
    } catch (err: unknown) {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-svh w-full flex items-center justify-center bg-ui-bg">
      <div className="w-full max-w-[460px] px-4 py-8">
        {/* Logo/Header */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-ui-lg bg-ui-primary">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-xl font-bold text-ui-text">System Admin</h1>
            <p className="ui-text-muted">Control Panel</p>
          </div>
        </div>

        <div className="ui-card">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-ui-text mb-2">Sign In</h2>
            <p className="ui-text-muted">Enter your credentials to access the admin panel</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="ui-label text-left">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                className="ui-input text-left"
                placeholder="admin@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="ui-label text-left">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="ui-input text-left"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="ui-alert-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="ui-button-primary w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In to Admin Panel"
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center ui-text-light">
          This area is restricted to authorized system administrators only.
        </p>
      </div>
    </div>
  )
}
