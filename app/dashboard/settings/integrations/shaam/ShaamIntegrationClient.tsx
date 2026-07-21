"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type SafeConnection = {
  company_id: string
  provider: string
  issued_at: string
  expires_at: string
  connected_at: string
  last_refresh_at: string | null
  revoked_at: string | null
  scopes: string | null
  status: "active" | "expired" | "revoked" | "error"
  last_error_code: string | null
  last_error_message: string | null
}

function formatDateTimeHe(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" })
}

function computeUiStatus(conn: SafeConnection | null): {
  key: "not_connected" | "active" | "expired" | "error" | "revoked"
  label: string
  tone: "success" | "warning" | "danger" | "muted"
} {
  if (!conn) return { key: "not_connected", label: "לא מחובר", tone: "muted" }
  if (conn.status === "revoked") return { key: "revoked", label: "נותק", tone: "muted" }
  if (conn.status === "error") return { key: "error", label: "שגיאה", tone: "danger" }

  // expires_at is the short-lived access token (~4h), which refreshes automatically.
  // It says nothing about the connection, so it must not drive this status —
  // otherwise a healthy connection reads as expired every few hours.
  // Only the server-recorded status marks a connection as actually expired.
  if (conn.status === "expired") return { key: "expired", label: "פג תוקף", tone: "warning" }

  return { key: "active", label: "מחובר ✓", tone: "success" }
}

export default function ShaamIntegrationClient(props: { connection: SafeConnection | null; shaamEnv: string | null }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [busy, setBusy] = useState<null | "refresh" | "disconnect">(null)
  const [msg, setMsg] = useState<null | { type: "success" | "error" | "info"; text: string }>(null)

  const flash = useMemo(() => {
    if (sp.get("connected") === "1") return { type: "success" as const, text: "החיבור ל־SHAAM בוצע בהצלחה." }
    if (sp.get("error") === "1") return { type: "error" as const, text: "החיבור ל־SHAAM נכשל. נסה שוב." }
    return null
  }, [sp])

  const view = useMemo(() => {
    const ui = computeUiStatus(props.connection)
    return {
      ui,
      connectedAt: props.connection?.connected_at || props.connection?.issued_at || null,
      lastRefreshAt: props.connection?.last_refresh_at || null,
      revokedAt: props.connection?.revoked_at || null,
      lastError: props.connection?.last_error_message || null,
      lastErrorCode: props.connection?.last_error_code || null,
    }
  }, [props.connection])

  const banner = msg || flash

  async function onRefresh() {
    setBusy("refresh")
    setMsg(null)
    try {
      const res = await fetch("/api/shaam/token/refresh", { method: "POST" })
      const json = (await res.json().catch(() => ({}))) as any
      if (json?.ok) {
        setMsg({ type: "success", text: "בוצעה רענון הרשאה בהצלחה." })
        router.refresh()
        return
      }
      if (json?.message === "cooldown") {
        const s = Number(json?.cooldown_seconds_remaining || 0) || 0
        setMsg({ type: "info", text: s > 0 ? `אפשר לרענן שוב בעוד ${s} שניות.` : "בוצעה בקשת רענון לאחרונה. נסה שוב בעוד רגע." })
        return
      }
      setMsg({ type: "error", text: "רענון ההרשאה נכשל. ייתכן שנדרש להתחבר מחדש." })
      router.refresh()
    } catch {
      setMsg({ type: "error", text: "שגיאה בביצוע רענון. נסה שוב." })
    } finally {
      setBusy(null)
    }
  }

  async function onDisconnect() {
    const ok = confirm("האם לנתק את החיבור ל־SHAAM? פעולה זו תבטל את החיבור ותדרוש התחברות מחדש.")
    if (!ok) return
    setBusy("disconnect")
    setMsg(null)
    try {
      const res = await fetch("/api/shaam/oauth/disconnect", { method: "POST" })
      const json = (await res.json().catch(() => ({}))) as any
      if (json?.ok) {
        setMsg({ type: "success", text: "החיבור נותק." })
        router.refresh()
        return
      }
      setMsg({ type: "error", text: "ניתוק החיבור נכשל." })
    } catch {
      setMsg({ type: "error", text: "שגיאה בניתוק החיבור. נסה שוב." })
    } finally {
      setBusy(null)
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-bg">
      <div className="ui-container pt-10">
        <div className="mb-[50px]">
          <h1 className="text-right mb-4">SHAAM / רשות המסים</h1>
          <p className="text-right">
            החיבור מנוהל ע״י רשות המסים. התוקף נקבע ע״י רשות המסים (בדרך כלל ~3 חודשים), וייתכן שתידרש התחברות מחדש מספר
            פעמים בשנה. אנחנו לא חוסמים גישה ביוזמתנו — זהו חיווי בלבד.
          </p>
        </div>

        {props.shaamEnv === "sandbox" && (
          <Card className="mb-6 border-warning bg-warning/10">
            <CardContent className="p-4">
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: "#19183B" }}>⚠️ SANDBOX MODE</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: "#19183B" }}>נתונים מדומים בלבד.</div>
            </CardContent>
          </Card>
        )}

        {banner && (
          <Card
            className={cn(
              "mb-6",
              banner.type === "success"
                ? "border-success bg-success/10"
                : banner.type === "info"
                  ? "border-warning bg-warning/10"
                  : "border-danger bg-danger/10"
            )}
            role="alert"
            aria-live="polite"
            style={{ borderWidth: 1, borderStyle: "solid" }}
          >
            <CardContent className="p-4">
              <p
                style={{
                  margin: 0,
                  fontWeight: 700,
                  color: banner.type === "success" ? "#0F5132" : banner.type === "info" ? "#8A6A00" : "#9B0003",
                }}
              >
                {banner.text}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="rounded-[20px] border border-border/60 bg-white/80 p-6 space-y-4">
          <div className="flex items-start justify-between gap-6">
            <div className="text-right">
              <div className="text-sm text-muted-fg">סטטוס</div>
              <div className="text-lg font-semibold">{view.ui.label}</div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                onClick={() => {
                  window.location.href = "/api/shaam/oauth/start"
                }}
                variant="primary"
                disabled={busy !== null}
              >
                התחבר / התחבר מחדש
              </Button>

              <Button onClick={onRefresh} variant="secondary" disabled={busy !== null || view.ui.key === "not_connected" || view.ui.key === "revoked"}>
                {busy === "refresh" ? "מרענן..." : "רענן הרשאה"}
              </Button>

              <Button onClick={onDisconnect} variant="danger" disabled={busy !== null || view.ui.key === "not_connected" || view.ui.key === "revoked"}>
                {busy === "disconnect" ? "מנתק..." : "נתק"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-right">
              <div className="text-sm text-muted-fg">סטטוס חיבור</div>
              <div className="font-mono text-sm">
                {view.ui.key === "active" ? `מחובר · מ־${formatDateTimeHe(view.connectedAt)}` : view.ui.label}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-fg">רענון אחרון</div>
              <div className="font-mono text-sm">{formatDateTimeHe(view.lastRefreshAt)}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-fg">נותק בתאריך</div>
              <div className="font-mono text-sm">{formatDateTimeHe(view.revokedAt)}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-fg">שגיאה אחרונה</div>
              <div className="text-sm">{view.lastError ? `${view.lastErrorCode ? `${view.lastErrorCode}: ` : ""}${view.lastError}` : "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

