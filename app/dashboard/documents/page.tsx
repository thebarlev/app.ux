import Link from "next/link";

const DOCUMENT_PRODUCTS = [
  {
    slug: "receipt",
    title: "קבלות",
    description: "הפקה וניהול קבלות",
  },
  {
    slug: "tax-invoice",
    title: "חשבוניות מס",
    description: "הפקה וניהול חשבוניות מס",
  },
  {
    slug: "tax-invoice-receipt",
    title: "חשבונית מס קבלה",
    description: "מסמך משולב",
  },
];

export default function DocumentsPortalPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>מסמכים</h1>
      <p style={{ marginTop: 8 }}>
        כל סוג מסמך הוא מוצר נפרד בחשבון שלך
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginTop: 24,
        }}
      >
        {DOCUMENT_PRODUCTS.map((doc) => (
          <Link
            key={doc.slug}
            href={`/dashboard/documents/${doc.slug}`}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 16,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {doc.title}
            </div>
            <div style={{ marginTop: 8, opacity: 0.8 }}>
              {doc.description}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

