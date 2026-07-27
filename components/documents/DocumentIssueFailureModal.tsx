"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Every issuance failure is shown here, never as a toast alone: a document that
 * did not issue is not something the user should be able to scroll past. The
 * server's own message is always displayed, and `reason` adds the concrete "what
 * is missing / what to do next" line.
 */

export type DocumentIssueFailure = {
  message: string;
  reason?: string | null;
  /** Present when the failure is specifically a missing/expired SHAAM connection. */
  needsShaamConnect?: boolean;
};

/**
 * Reason codes come from finalizeDocument (lib/document-helpers.ts) and
 * issueDocumentAction (lib/documents/actions.ts). Anything unmapped still shows
 * the server message plus a generic next step — the point is that no failure is
 * ever silent.
 */
const REASON_GUIDANCE: Record<string, { title: string; hint: string }> = {
  osek_patur_cannot_issue_tax_invoice: {
    title: "עוסק פטור אינו רשאי להנפיק חשבונית מס",
    hint: "הפק במקום זאת חשבון עסקה או קבלה. אם העסק שלך אינו עוסק פטור — עדכן את סוג העסק בהגדרות › פרטי העסק.",
  },
  osek_patur_cannot_charge_vat: {
    title: "עוסק פטור אינו רשאי לגבות מע״מ",
    hint: "אפס את שיעור המע״מ במסמך ונסה שוב. אם סוג העסק שגוי — עדכן אותו בהגדרות › פרטי העסק.",
  },
  business_type_load_failed: {
    title: "לא ניתן לאמת את סוג העסק",
    hint: "זו תקלה זמנית בטעינת פרטי העסק. נסה שוב בעוד רגע.",
  },
  shaam_reconnect_required: {
    title: "נדרש חיבור לרשות המסים",
    hint: "מסמך זה חייב מספר הקצאה מרשות המסים. התחבר עכשיו — ותוחזר לכאן כדי לסיים את ההפקה. מה שהזנת נשמר.",
  },
  shaam_allocation_missing_vat: {
    title: "חסר מספר עוסק / ח.פ",
    hint: 'מסמך מעל הסף מחייב מספר עוסק/ח.פ או ת.ז של הלקוח. מלא את השדה "מספר עוסק / ח.פ של הלקוח" ונסה שוב.',
  },
  shaam_allocation_customer_equals_issuer: {
    title: "מספר הלקוח זהה למספר העסק המנפיק",
    hint: 'רשות המסים אינה מאשרת חשבונית שמונפקת לעצמך. בדוק את השדה "מספר עוסק / ח.פ של הלקוח" — ואם מספר העסק שלך שגוי, עדכן אותו בהגדרות › פרטי העסק.',
  },
  shaam_allocation_items_empty: {
    title: "אין שורות במסמך",
    hint: "חובה להוסיף לפחות שורה אחת כדי לקבל מספר הקצאה.",
  },
  shaam_allocation_invalid_reference: {
    title: "מספר מסמך לא תקין",
    hint: "מספר המסמך אינו תקין לבקשת הקצאה. רענן את הדף ונסה שוב.",
  },
  shaam_allocation_rejected: {
    title: "רשות המסים דחתה את בקשת ההקצאה",
    hint: "בדוק את פרטי הלקוח והסכומים במסמך. אם הכל תקין — פנה לתמיכה עם מספר המסמך.",
  },
  shaam_allocation_bad_request: {
    title: "נתונים לא תקינים לבקשת ההקצאה",
    hint: "בדוק את פרטי הלקוח (שם, ח.פ/ת.ז, מדינה) ואת שורות המסמך, ונסה שוב.",
  },
  shaam_allocation_payload_invalid: {
    title: "נתונים לא תקינים לבקשת ההקצאה",
    hint: "בדוק את פרטי המסמך ונסה שוב.",
  },
  shaam_allocation_temporary: {
    title: "תקלה זמנית מול רשות המסים",
    hint: "לא התקבל מספר הקצאה. נסה שוב בעוד רגע — לא הופק מסמך ולא נצרך מספר.",
  },
  shaam_allocation_context_load_failed: {
    title: "לא ניתן לאמת את נתוני העסק מול רשות המסים",
    hint: "תקלה זמנית. נסה שוב בעוד רגע.",
  },
  shaam_allocation_line_items_failed: {
    title: "תקלה בהכנת שורות המסמך",
    hint: "נסה שוב בעוד רגע.",
  },
  shaam_token_transient: {
    title: "תקלה זמנית בחיבור לרשות המסים",
    hint: "החיבור קיים אך לא נענה כעת. נסה שוב בעוד רגע.",
  },
  signing_business_not_registered: {
    title: "העסק אינו רשום בשירות החתימה הדיגיטלית",
    hint: "כל מסמך חשבונאי נחתם דיגיטלית לפני ההפקה, ושירות החתימה אינו מזהה את העסק הזה (403 business_not_in_source). זו הגדרה בצד השירות — פנה לתמיכה. אין קשר לסכום המסמך או לרשות המסים.",
  },
  signing_failed: {
    title: "החתימה הדיגיטלית נכשלה",
    hint: "לא ניתן היה לחתום על המסמך, ולכן הוא לא הופק ולא נצרך מספר. נסה שוב בעוד רגע; אם התקלה חוזרת — פנה לתמיכה.",
  },
  chained_amount_above_source: {
    title: "הסכום גבוה מהמסמך המקורי",
    hint: "מסמך מקושר יכול לכסות את המקור במלואו או בחלקו, אך לא לחייב מעליו. הקטן את הסכום, או הפק מסמך חדש עבור התשלום הנוסף.",
  },
  template_not_found: {
    title: "אין תבנית פעילה לסוג המסמך",
    hint: "יש להגדיר תבנית פעילה עבור סוג המסמך לפני ההפקה.",
  },
};

const GENERIC = {
  title: "הפקת המסמך נכשלה",
  hint: "המסמך לא הופק ולא נצרך מספר מסמך. נסה שוב, ואם התקלה חוזרת — פנה לתמיכה עם ההודעה שלמעלה.",
};

export function DocumentIssueFailureModal({
  failure,
  onClose,
  onConnectShaam,
}: {
  failure: DocumentIssueFailure | null;
  onClose: () => void;
  onConnectShaam?: () => void;
}) {
  const open = failure !== null;
  const reason = failure?.reason ? String(failure.reason) : "";
  const guidance = REASON_GUIDANCE[reason] || GENERIC;
  const showConnect = Boolean(failure?.needsShaamConnect && onConnectShaam);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">{guidance.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {failure?.message && failure.message !== guidance.title ? (
            <div className="rounded-md border border-danger bg-danger/10 p-3 text-sm text-danger">
              {failure.message}
            </div>
          ) : null}

          <p className="text-sm text-muted-foreground">{guidance.hint}</p>

          {reason ? (
            <p className="text-xs text-muted-foreground/70" dir="ltr">
              code: {reason}
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
          {showConnect ? (
            <>
              <Button onClick={onConnectShaam} className="w-full sm:w-auto">
                התחבר לרשות המסים
              </Button>
              <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
                לא עכשיו
              </Button>
            </>
          ) : (
            <Button onClick={onClose} className="w-full sm:w-auto">
              הבנתי
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DocumentIssueFailureModal;
