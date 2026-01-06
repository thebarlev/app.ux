"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { Customer, deleteCustomerAction } from "./actions";
import ConfirmDialog from "@/components/ConfirmDialog";

type Props = {
  initialCustomers: Customer[];
};

export default function CustomersListClient({ initialCustomers }: Props) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    customerId: string | null;
    customerName: string;
  }>({
    open: false,
    customerId: null,
    customerName: "",
  });

  // Filter customers based on search query
  const filteredCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteClick = (customerId: string, customerName: string) => {
    setDeleteDialog({
      open: true,
      customerId,
      customerName,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.customerId) return;

    setIsDeleting(deleteDialog.customerId);
    const result = await deleteCustomerAction(deleteDialog.customerId);

    if (result.ok) {
      setCustomers((prev) => prev.filter((c) => c.id !== deleteDialog.customerId));
      router.refresh();
    } else {
      alert(result.message || "שגיאה במחיקת הלקוח");
    }

    setIsDeleting(null);
    setDeleteDialog({ open: false, customerId: null, customerName: "" });
  };

  return (
    <div>
      {/* Search Bar */}
      <div style={{ marginBottom: 24 }}>
          <input
            type="text"
            placeholder="חיפוש לפי שם..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              maxWidth: 400,
              padding: '12px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#EDF1F5',
              fontSize: 18,
              color: '#19183B',
              boxShadow: '0 0 13px 0 rgba(0,0,0,0.10)',
            }}
          />
        </div>

        {/* Customers List */}
        {filteredCustomers.length === 0 ? (
          <div
            style={{
              padding: 60,
              textAlign: 'center',
              background: '#FFF',
              borderRadius: 20,
              boxShadow: '0 0 13px 0 rgba(0,0,0,0.10)',
              color: '#19183B',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              {searchQuery ? 'לא נמצאו לקוחות' : 'אין לקוחות עדיין'}
            </h3>
            <p style={{ opacity: 0.7, marginBottom: 20, fontSize: 18 }}>
              {searchQuery ? 'נסה לשנות את מונחי החיפוש' : 'התחל על ידי הוספת לקוח חדש'}
            </p>
            {!searchQuery && (
              <Link href="/dashboard/customers/new" style={{ textDecoration: 'none' }}>
                <button
                  type="button"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: '#F39600',
                    color: '#19183B',
                    fontSize: '18px',
                    fontWeight: 700,
                    border: 'none',
                    borderRadius: '12px',
                    padding: '10px 24px',
                    boxShadow: '0 0 13px 0 rgba(0,0,0,0.10)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FFC669')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#F39600')}
                >
                  <span style={{ fontSize: 22, fontWeight: 'bold', color: '#19183B' }}>+</span>
                  <span style={{ color: '#19183B' }}>לקוח ראשון</span>
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div
            style={{
              background: '#FFF',
              borderRadius: 20,
              boxShadow: '0 0 13px 0 rgba(0,0,0,0.10)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 18, color: '#19183B' }}>
              <thead>
                <tr style={{ background: '#EDF1F5', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: 20, textAlign: 'right', fontWeight: 700 }}>שם</th>
                  <th style={{ padding: 20, textAlign: 'right', fontWeight: 700 }}>אימייל</th>
                  <th style={{ padding: 20, textAlign: 'right', fontWeight: 700 }}>טלפון</th>
                  <th style={{ padding: 20, textAlign: 'right', fontWeight: 700 }}>נייד</th>
                  <th style={{ padding: 20, textAlign: 'center', fontWeight: 700 }}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                  {filteredCustomers.map((customer, idx) => (
                  <tr
                    key={customer.id}
                    style={{
                      borderBottom: idx < filteredCustomers.length - 1 ? '1px solid #EDF1F5' : 'none',
                      cursor: 'pointer',
                      background: idx % 2 === 0 ? '#FFF' : '#F9FAFB',
                    }}
                    onClick={() => router.push(`/dashboard/customers/${customer.id}`)}
                  >
                    <td style={{ padding: 20, fontWeight: 600 }}>{customer.name}</td>
                    <td style={{ padding: 20, opacity: 0.8 }}>{customer.email || '-'}</td>
                    <td style={{ padding: 20, opacity: 0.8, direction: 'ltr', textAlign: 'right' }}>
                      {customer.phone || '-'}
                    </td>
                    <td style={{ padding: 20, opacity: 0.8, direction: 'ltr', textAlign: 'right' }}>
                      {customer.mobile || '-'}
                    </td>
                    <td style={{ padding: 20, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/customers/${customer.id}`);
                          }}
                          style={{
                            padding: '8px 18px',
                            background: '#1D868F',
                            color: '#FFF',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 16,
                            fontWeight: 700,
                            boxShadow: '0 0 8px 0 rgba(29,134,143,0.10)',
                          }}
                        >
                          ערוך
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(customer.id, customer.name);
                          }}
                          disabled={isDeleting === customer.id}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: isDeleting === customer.id ? 'not-allowed' : 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: isDeleting === customer.id ? 0.5 : 1,
                          }}
                          aria-label="מחק לקוח"
                          title="מחק לקוח"
                        >
                          <X 
                            size={20} 
                            style={{ color: '#9B0003' }}
                          />
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
      <div style={{ marginTop: 24, opacity: 0.7, fontSize: 18, color: '#19183B', textAlign: 'left' }}>
        {searchQuery ? `נמצאו ${filteredCustomers.length} לקוחות` : `סה"כ ${customers.length} לקוחות`}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialog({ open: false, customerId: null, customerName: "" });
          }
        }}
        title="מחיקת לקוח"
        message={`האם יש אישור למחוק את הלקוח "${deleteDialog.customerName}"?`}
        confirmText="מחק"
        cancelText="ביטול"
        onConfirm={handleDeleteConfirm}
        destructive={true}
      />
    </div>
  );
}
