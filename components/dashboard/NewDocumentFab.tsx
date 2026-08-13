"use client";

import { useState } from "react";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Minus, ChevronLeft } from "lucide-react";

export default function NewDocumentFab({
  variant = "floating",
  asideExpanded = true,
}: {
  variant?: "floating" | "aside";
  asideExpanded?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const pathname = usePathname();

  // איפוס התפריט בכל שינוי דף
  React.useEffect(() => {
    setIsOpen(false);
    setShowMore(false);
  }, [pathname]);

  // סגירת התפריט עם Escape
  React.useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setShowMore(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  /*
   * ⛔ REVERTED. The five entries are back, and the reasoning that removed them was wrong.
   *
   * They were removed because each had an appendix-1 code, no mapping, no sequence and zero
   * documents ever issued — read as "the software does not manage this type". That inference
   * does not hold: in a system whose first documents were issued this month, zero documents is
   * the starting state of every type, not evidence about the feature.
   *
   * Measured against the product instead: a חשבון עסקה issues, and a חשבונית מס/קבלה or a
   * קבלה chains from it carrying the source document's number. The logic works.
   *
   * What remains true is narrower and stays recorded in codes.ts: a type must not be MAPPED to
   * an appendix-1 code until the submitted data actually contains documents of it. Declaring is
   * the risk; offering the feature is not.
   */
  const primaryDocs = [
    { href: "/dashboard/incomes/documents/new/invoice", label: "חשבונית מס" },
    { href: "/dashboard/incomes/documents/new/invoiceReceipt", label: "חשבונית מס / קבלה" },
    { href: "/dashboard/incomes/documents/new/creditNote", label: "חשבונית זיכוי" },
    { href: "/dashboard/incomes/documents/new/receipt", label: "קבלה" },
    { href: "/business/documents/new/quote", label: "הצעת מחיר" },
    { href: "/business/documents/new/proforma", label: "חשבון עסקה (דרישת תשלום)" },
  ];

  const moreDocs = [
    { href: "/business/documents/new/workOrder", label: "הזמנת עבודה" },
    { href: "/business/documents/new/deliveryNote", label: "תעודת משלוח" },
    { href: "/business/documents/new/returnNote", label: "תעודת החזרה" },
    { href: "/business/documents/new/purchaseOrder", label: "הזמנת רכש" },
    { href: "/business/documents/new/selfInvoice", label: "חשבונית עצמית" },
    { href: "/business/documents/new/selfCreditNote", label: "חשבונית זיכוי עצמית" },
  ];

  return (
    <>
      {/* כפתור + ירוק */}
      <button
        onClick={() => {
          if (isOpen) {
            // סגירה - איפוס הכל
            setIsOpen(false);
            setShowMore(false);
          } else {
            // פתיחה - תמיד מכווץ
            setIsOpen(true);
            setShowMore(false);
          }
        }}
        className={
          variant === "floating"
            ? "fixed bottom-6 left-6 z-[70] w-[57px] h-[57px] bg-[#99DE76] hover:bg-[#8BCF65] shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95"
            : `w-[60px] h-[60px] flex items-center justify-center transition-all bg-[#99DE76] hover:bg-[#8BCF65] text-black`
        }
        aria-label={isOpen ? "סגור תפריט" : "פתח תפריט מסמכים"}
      >
        <div className={variant === "floating" ? "relative w-[23px] h-[23px]" : "relative w-[20px] h-[20px]"}>
          <Plus
            className={`absolute inset-0 ${
              variant === "floating" ? "w-[23px] h-[23px]" : "w-[20px] h-[20px]"
            } text-black transition-all duration-300 ${
              isOpen ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"
            }`}
            strokeWidth={3}
          />
          <Minus
            className={`absolute inset-0 ${
              variant === "floating" ? "w-[23px] h-[23px]" : "w-[20px] h-[20px]"
            } text-black transition-all duration-300 ${
              isOpen ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-0"
            }`}
            strokeWidth={3}
          />
        </div>
      </button>

      {/* תפריט מסמכים */}
      {isOpen && (
        <>
          {/* רקע כהה */}
          <div
            className="fixed inset-0 bg-black/50 z-[65] animate-in fade-in duration-200"
            onClick={() => {
              setIsOpen(false);
              setShowMore(false);
            }}
          />

          {/* התפריט */}
          <div
            className={`fixed bottom-6 ${
              variant === "floating" ? "left-6" : ""
            } z-[68] animate-in slide-in-from-bottom-4 duration-300`}
            style={
              variant === "floating"
                ? undefined
                : {
                    // Place the menu just left of the right aside (best-effort, depends on expanded/collapsed width)
                    right: asideExpanded ? 275 : 125,
                  }
            }
          >
            <div className="bg-white rounded-2xl shadow-2xl p-6 min-w-[320px] max-w-[400px]">
              {/* מסמכים ראשיים */}
              <div className="space-y-2">
                {primaryDocs.map((doc) => (
                  <Link
                    key={doc.href}
                    href={doc.href}
                    onClick={() => {
                      setIsOpen(false);
                      setShowMore(false);
                    }}
                    className="block px-4 py-3 rounded-lg text-right hover:bg-gray-100 transition-colors text-gray-800 font-medium"
                  >
                    {doc.label}
                  </Link>
                ))}
              </div>

              {/* קו מפריד */}
              <div className="border-t border-gray-200 my-3"></div>

              {/* כפתור "מסמכים נוספים" - מוצג רק כשלא הכל פתוח */}
              {!showMore && (
                <button
                  onClick={() => setShowMore(true)}
                  className="w-full flex items-center justify-start gap-2 px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors text-gray-800 font-bold text-right"
                >
                  <span>מסמכים נוספים</span>
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              {/* מסמכים נוספים */}
              {showMore && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  {moreDocs.map((doc) => (
                    <Link
                      key={doc.href}
                      href={doc.href}
                      onClick={() => {
                        setIsOpen(false);
                        setShowMore(false);
                      }}
                      className="block px-4 py-3 rounded-lg text-right hover:bg-gray-100 transition-colors text-gray-700"
                    >
                      {doc.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}