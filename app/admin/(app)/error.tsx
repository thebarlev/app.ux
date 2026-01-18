"use client"

import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Admin error:", error)
  }, [error])

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Admin error</h2>
        <p style={{ marginBottom: 12, opacity: 0.8 }}>An error occurred in the admin panel.</p>
        {error?.message ? (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#f3f4f6",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              fontSize: 12,
            }}
          >
            {error.message}
          </pre>
        ) : null}
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 44,
              padding: "0 16px",
              borderRadius: 8,
              border: "1px solid #111827",
              background: "#111827",
              color: "white",
              fontWeight: 600,
            }}
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = "/admin")}
            style={{
              height: 44,
              padding: "0 16px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "white",
              color: "#111827",
              fontWeight: 600,
            }}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
