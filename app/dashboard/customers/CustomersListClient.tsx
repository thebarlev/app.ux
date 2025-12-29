"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Customer, deleteCustomerAction } from "./actions";

type Props = {
  initialCustomers: Customer[];
};

export default function CustomersListClient({ initialCustomers }: Props) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Filter customers based on search query
  const filteredCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (customerId: string, customerName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הלקוח "${customerName}"?`)) {
      return;
    }

    setIsDeleting(customerId);
    const result = await deleteCustomerAction(customerId);

    if (result.ok) {
      setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    } else {
      alert(`שגיאה במחיקת לקוח: ${result.message}`);
    }
    setIsDeleting(null);
  };

  return (
    <div dir="rtl" style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>לקוחות</h1>
          <p style={{ marginTop: 8, opacity: 0.75 }}>ניהול לקוחות ופרטי קשר</p>
        </div>
        <Link
          href="/dashboard/customers/new"
          style={{
            padding: "12px 24px",
            background: "#111827",
            color: "white",
            borderRadius: 12,
            textDecoration: "none",
            fontWeight: 700,
            display: "inline-block",
          }}
        >
          + הוסף לקוח חדש
        </Link>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          placeholder="חיפוש לפי שם..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 400,
            padding: "12px 16px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            fontSize: 14,
          }}
        />
      </div>

      {/* Customers List */}
      {filteredCustomers.length === 0 ? (
        <div
          style={{
            padding: 60,
            textAlign: "center",
            background: "#f9fafb",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {searchQuery ? "לא נמצאו לקוחות" : "אין לקוחות עדיין"}
          </h3>
          <p style={{ opacity: 0.6, marginBottom: 20 }}>
            {searchQuery ? "נסה לשנות את מונחי החיפוש" : "התחל על ידי הוספת לקוח חדש"}
          </p>
          {!searchQuery && (
            <Link
              href="/dashboard/customers/new"
              style={{
                padding: "10px 20px",
                background: "#111827",
                color: "white",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 600,
                display: "inline-block",
              }}
            >
              הוסף לקוח ראשון
            </Link>
          )}
        </div>
      ) : (
        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>שם</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>אימייל</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>טלפון</th>
                <th style={{ padding: 16, textAlign: "right", fontWeight: 700 }}>נייד</th>
                <th style={{ padding: 16, textAlign: "center", fontWeight: 700 }}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer, idx) => (
                <tr
                  key={customer.id}
                  style={{
                    borderBottom: idx < filteredCustomers.length - 1 ? "1px solid #f3f4f6" : "none",
                    cursor: "pointer",
                  }}
                  onClick={() => router.push(`/dashboard/customers/${customer.id}`)}
                >
                  <td style={{ padding: 16, fontWeight: 600 }}>{customer.name}</td>
                  <td style={{ padding: 16, opacity: 0.7 }}>{customer.email || "-"}</td>
                  <td style={{ padding: 16, opacity: 0.7, direction: "ltr", textAlign: "right" }}>
                    {customer.phone || "-"}
                  </td>
                  <td style={{ padding: 16, opacity: 0.7, direction: "ltr", textAlign: "right" }}>
                    {customer.mobile || "-"}
                  </td>
                  <td style={{ padding: 16, textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dashboard/customers/${customer.id}`);
                        }}
                        style={{
                          padding: "6px 12px",
                          background: "#3b82f6",
                          color: "white",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        ערוך
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(customer.id, customer.name);
                        }}
                        disabled={isDeleting === customer.id}
                        style={{
                          padding: "6px 12px",
                          background: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: 6,
                          cursor: isDeleting === customer.id ? "not-allowed" : "pointer",
                          fontSize: 13,
                          fontWeight: 600,
                          opacity: isDeleting === customer.id ? 0.5 : 1,
                        }}
                      >
                        {isDeleting === customer.id ? "מוחק..." : "מחק"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      <div style={{ marginTop: 16, opacity: 0.6, fontSize: 14 }}>
        {searchQuery ? `נמצאו ${filteredCustomers.length} לקוחות` : `סה"כ ${customers.length} לקוחות`}
      </div>
    </div>
  );
}
