"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      textAlign: "center",
      padding: "24px"
    }}>
      <div style={{ fontSize: "72px", marginBottom: "16px" }}>⚠️</div>
      <h1 style={{ fontSize: "32px", fontWeight: 900, marginBottom: "12px", color: "#111827" }}>
        אופס… משהו השתבש
      </h1>
      <p style={{ fontSize: "18px", color: "#6b7280", marginBottom: "32px" }}>
        נתקלנו בבעיה בלתי צפויה. אנא נסו שוב.
      </p>
      <div style={{ display: "flex", gap: "12px" }}>
        <button 
          onClick={reset}
          style={{
            padding: "12px 24px",
            background: "#111827",
            color: "white",
            borderRadius: "12px",
            border: "none",
            fontWeight: 700,
            fontSize: "16px",
            cursor: "pointer"
          }}
        >
          נסה שוב
        </button>
        <a 
          href="/dashboard"
          style={{
            padding: "12px 24px",
            background: "white",
            color: "#111827",
            border: "1px solid #d1d5db",
            borderRadius: "12px",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "16px"
          }}
        >
          חזרה לדף הבית
        </a>
      </div>
    </div>
  );
}
