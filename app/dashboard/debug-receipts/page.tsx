import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DebugReceiptsPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Get user's company
  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Get ALL receipts for this company (bypass RLS by using service role if needed)
  const { data: allReceipts, error: receiptsError } = await supabase
    .from("documents")
    .select("*")
    .eq("document_type", "receipt")
    .order("created_at", { ascending: false });

  // Get receipts that SHOULD be visible (with company_id match)
  const { data: myReceipts } = await supabase
    .from("documents")
    .select("*")
    .eq("document_type", "receipt")
    .eq("company_id", company?.id || "")
    .order("created_at", { ascending: false });

  // Count receipts by status
  const draftCount = myReceipts?.filter(r => r.document_status === "draft").length || 0;
  const finalCount = myReceipts?.filter(r => r.document_status === "final").length || 0;

  return (
    <div dir="rtl" style={{ padding: 24, fontFamily: "monospace" }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 24 }}>🔍 Debug: מציאת קבלות</h1>

      {/* User Info */}
      <div style={{ marginBottom: 24, padding: 20, background: "#f0f9ff", borderRadius: 12, border: "1px solid #0ea5e9" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>👤 פרטי משתמש</h2>
        <div><strong>User ID:</strong> {user.id}</div>
        <div><strong>Email:</strong> {user.email}</div>
      </div>

      {/* Company Info */}
      <div style={{ marginBottom: 24, padding: 20, background: company ? "#f0fdf4" : "#fef2f2", borderRadius: 12, border: `1px solid ${company ? "#10b981" : "#ef4444"}` }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>🏢 פרטי חברה</h2>
        {company ? (
          <>
            <div><strong>Company ID:</strong> {company.id}</div>
            <div><strong>Company Name:</strong> {company.company_name}</div>
            <div><strong>Email:</strong> {company.email}</div>
            <div><strong>Created:</strong> {new Date(company.created_at).toLocaleString('he-IL')}</div>
          </>
        ) : (
          <div style={{ color: "#dc2626", fontWeight: 600 }}>❌ לא נמצאה חברה עבור המשתמש הזה!</div>
        )}
      </div>

      {/* Receipts Summary */}
      <div style={{ marginBottom: 24, padding: 20, background: "#fefce8", borderRadius: 12, border: "1px solid #eab308" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>📊 סיכום קבלות</h2>
        <div><strong>סה"כ קבלות שלי:</strong> {myReceipts?.length || 0}</div>
        <div><strong>טיוטות:</strong> {draftCount}</div>
        <div><strong>סופיות:</strong> {finalCount}</div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>
          <strong>סה"כ קבלות במערכת:</strong> {allReceipts?.length || 0}
        </div>
      </div>

      {/* Error */}
      {receiptsError && (
        <div style={{ marginBottom: 24, padding: 20, background: "#fef2f2", borderRadius: 12, border: "1px solid #ef4444" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#dc2626" }}>⚠️ שגיאה</h2>
          <div>{receiptsError.message}</div>
        </div>
      )}

      {/* My Receipts Table */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>📝 הקבלות שלי ({myReceipts?.length || 0})</h2>
        {myReceipts && myReceipts.length > 0 ? (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f3f4f6", borderBottom: "2px solid #d1d5db" }}>
                  <th style={{ padding: 8, textAlign: "right" }}>ID</th>
                  <th style={{ padding: 8, textAlign: "right" }}>מספר</th>
                  <th style={{ padding: 8, textAlign: "right" }}>סטטוס</th>
                  <th style={{ padding: 8, textAlign: "right" }}>לקוח</th>
                  <th style={{ padding: 8, textAlign: "right" }}>סכום</th>
                  <th style={{ padding: 8, textAlign: "right" }}>תאריך יצירה</th>
                  <th style={{ padding: 8, textAlign: "right" }}>Company ID</th>
                </tr>
              </thead>
              <tbody>
                {myReceipts.map((receipt) => (
                  <tr key={receipt.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: 8, fontSize: 10, opacity: 0.7 }}>{receipt.id.slice(0, 8)}...</td>
                    <td style={{ padding: 8, fontWeight: 600 }}>
                      {receipt.document_number || <span style={{ opacity: 0.5 }}>—</span>}
                    </td>
                    <td style={{ padding: 8 }}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        background: receipt.document_status === "draft" ? "#fef3c7" : "#d1fae5",
                        color: receipt.document_status === "draft" ? "#92400e" : "#065f46"
                      }}>
                        {receipt.document_status}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{receipt.customer_name || "—"}</td>
                    <td style={{ padding: 8 }}>{receipt.total_amount || 0} {receipt.currency || "ILS"}</td>
                    <td style={{ padding: 8, fontSize: 10 }}>
                      {new Date(receipt.created_at).toLocaleString('he-IL')}
                    </td>
                    <td style={{ padding: 8, fontSize: 10, opacity: 0.7 }}>
                      {receipt.company_id.slice(0, 8)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: "center", background: "#f9fafb", borderRadius: 12, border: "1px dashed #d1d5db" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>📭</div>
            <div style={{ fontWeight: 600 }}>לא נמצאו קבלות</div>
            <div style={{ marginTop: 4, opacity: 0.7 }}>זה יכול לקרות אם:</div>
            <ul style={{ marginTop: 8, textAlign: "right", display: "inline-block" }}>
              <li>עדיין לא יצרת קבלות</li>
              <li>הקבלות נוצרו עם company_id אחר</li>
              <li>יש בעיה ב-RLS policies</li>
            </ul>
          </div>
        )}
      </div>

      {/* All Receipts in System (Debug) */}
      {allReceipts && allReceipts.length > myReceipts?.length! && (
        <div style={{ marginBottom: 24, padding: 20, background: "#fef2f2", borderRadius: 12, border: "1px solid #fca5a5" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#dc2626" }}>
            ⚠️ קבלות שלא משוייכות לחברה שלך ({allReceipts.length - (myReceipts?.length || 0)})
          </h2>
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            יש {allReceipts.length - (myReceipts?.length || 0)} קבלות במערכת שלא משוייכות ל-company_id שלך.
          </div>
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>הצג פרטים</summary>
            <div style={{ overflow: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#fee2e2" }}>
                    <th style={{ padding: 6, textAlign: "right" }}>ID</th>
                    <th style={{ padding: 6, textAlign: "right" }}>מספר</th>
                    <th style={{ padding: 6, textAlign: "right" }}>לקוח</th>
                    <th style={{ padding: 6, textAlign: "right" }}>Company ID</th>
                  </tr>
                </thead>
                <tbody>
                  {allReceipts
                    .filter(r => r.company_id !== company?.id)
                    .map((receipt) => (
                      <tr key={receipt.id} style={{ borderBottom: "1px solid #fecaca" }}>
                        <td style={{ padding: 6, fontSize: 9 }}>{receipt.id.slice(0, 8)}...</td>
                        <td style={{ padding: 6 }}>{receipt.document_number || "—"}</td>
                        <td style={{ padding: 6 }}>{receipt.customer_name || "—"}</td>
                        <td style={{ padding: 6, fontSize: 9 }}>
                          {receipt.company_id.slice(0, 8)}...
                          {receipt.company_id === company?.id && <span style={{ color: "#10b981" }}> ✓</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: 32, display: "flex", gap: 12 }}>
        <a
          href="/dashboard/documents/receipts"
          style={{
            padding: "10px 20px",
            background: "#111827",
            color: "white",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600
          }}
        >
          → לעמוד הקבלות
        </a>
        <a
          href="/dashboard/documents/receipt"
          style={{
            padding: "10px 20px",
            background: "#10b981",
            color: "white",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600
          }}
        >
          + קבלה חדשה
        </a>
      </div>
    </div>
  );
}
