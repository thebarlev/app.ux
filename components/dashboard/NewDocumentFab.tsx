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
   * ⛔ FIVE TYPES REMOVED FROM THE MENU, and quote deliberately kept.
   *
   * Measured in production on 2026-08-13: proforma, returnNote, purchaseOrder, selfInvoice and
   * selfCreditNote each have an appendix-1 code (300, 210, 500, 700, 710), zero mapping in
   * lib/regulatory/bkmv/codes.ts, zero document_sequences rows and zero documents ever issued —
   * while every one of them was one click from this menu.
   *
   * That is exactly the state delivery_note was in, with one difference in our favour: no
   * sequence exists yet, so no regulatory number has been spent. The first person to use any of
   * these entries would allocate a number against a type the uniform file does not carry, and
   * a gap in a sequence is the first thing an audit looks for.
   *
   * Removed rather than disabled, so the menu does not offer what it will refuse — the same
   * reasoning the credit-note block used for its tile.
   *
   * ⚠️ They are NOT deleted from the product. getDocumentConfig still defines them and
   * /business/documents/new/[documentType] still renders them, so each comes back by restoring
   * its line here — together with a mapping in codes.ts and documents in the submitted data.
   * That order matters: the mapping without the documents is what we removed proforma for.
   *
   * quote stays. Appendix 1 has no code for הצעת מחיר because a quote is not an accounting
   * document, so it can never leave a hole in a regulatory sequence.
   */
  const primaryDocs = [
    { href: "/dashboard/incomes/documents/new/invoice", label: "חשבונית מס" },
    { href: "/dashboard/incomes/documents/new/invoiceReceipt", label: "חשבונית מס / קבלה" },
    { href: "/dashboard/incomes/documents/new/creditNote", label: "חשבונית זיכוי" },
    { href: "/dashboard/incomes/documents/new/receipt", label: "קבלה" },
    { href: "/business/documents/new/quote", label: "הצעת מחיר" },
  ];

  const moreDocs = [
    { href: "/business/documents/new/workOrder", label: "הזמנת עבודה" },
    { href: "/business/documents/new/deliveryNote", label: "תעודת משלוח" },
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