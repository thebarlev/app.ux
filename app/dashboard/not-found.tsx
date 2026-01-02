export default function DashboardNotFound() {
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
      <div style={{ fontSize: "72px", marginBottom: "16px" }}>😊</div>
      <h1 style={{ fontSize: "32px", fontWeight: 900, marginBottom: "12px", color: "#111827" }}>
        העמוד הזה עדיין בבנייה
      </h1>
      <p style={{ fontSize: "18px", color: "#6b7280", marginBottom: "32px" }}>
        אנחנו עובדים על זה — בקרו שוב מאוחר יותר!
      </p>
      <a 
        href="/dashboard"
        style={{
          padding: "12px 24px",
          background: "#111827",
          color: "white",
          borderRadius: "12px",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: "16px"
        }}
      >
        חזרה לדף הבית
      </a>
    </div>
  );
}
