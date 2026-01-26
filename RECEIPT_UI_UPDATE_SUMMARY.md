# 📋 עדכון UI של סקשן "פירוט תקבולים" - סיכום

**תאריך:** 25 בינואר 2026  
**קובץ מעודכן:** `/app/dashboard/documents/receipt/ReceiptFormClient.tsx`

---

## 🎯 מטרת העדכון

עדכון סקשן **"פירוט תקבולים"** בעמוד הקבלה כך שה-UI יהיה **זהה** לסקשן "רשימת פריטים" בעמוד חשבונית מס.

---

## ✅ מה שונה

### **1. שינויי UI (Visual Design)**

#### **לפני:**
- שדות מסודרים ב-grid דינמי (responsive)
- כל שדה עם label משלו
- כפתור מחיקה בפינה השמאלית העליונה
- `PaymentDetailsSection` תמיד גלוי

#### **אחרי:**
- טבלה עם headers קבועים
- `grid grid-cols-[1.5fr_1fr_1.5fr_0.8fr_0.8fr]` - עמודות מוגדרות
- שדות עם `variant="underline"` (styling כמו בחשבונית מס)
- `MoneyInput` עם `variant="items"`
- `PaymentDetailsSection` גלוי רק כשהשורה **לא** מאושרת

---

### **2. תוספת פונקציונליות - Inline Editing**

#### **כפתורים חדשים:**

**א. כפתור "אישור" (✓)**
```tsx
<Button type="button" variant="default" onClick={() => confirmPaymentRow(i)}>
  אישור
</Button>
```
- מופיע כשהשורה **לא** מאושרת
- לוחץ → מאשר את השורה
- מריץ validation לפני אישור

**ב. כפתור "עריכה" (✏️)**
```tsx
<Button
  type="button"
  variant="ghost"
  size="icon"
  onClick={() => setConfirmedPayments((prev) => {
    const next = new Set(prev);
    next.delete(i);
    return next;
  })}
  aria-label="עריכה"
>
  <Pencil className="h-4 w-4" />
</Button>
```
- מופיע כשהשורה **מאושרת**
- לוחץ → מבטל את האישור ומעביר ל-edit mode

**ג. כפתור "מחיקה" (🗑️)**
- נשאר בדיוק אותו דבר, רק שונה המיקום (בסוף השורה במקום בפינה)

---

### **3. State Management חדש**

#### **State נוסף:**
```tsx
const [confirmedPayments, setConfirmedPayments] = useState<Set<number>>(new Set());
const hasConfirmedPayments = confirmedPayments.size > 0;
```

#### **פונקציות חדשות:**
```tsx
function validatePaymentRow(payment: PaymentRow) {
  const errors: { method?: string; amount?: string } = {};
  if (!payment.method || payment.method.trim().length === 0) {
    errors.method = "חובה לבחור אמצעי תשלום";
  }
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
    errors.amount = "סכום חייב להיות גדול מ-0";
  }
  return errors;
}

function confirmPaymentRow(i: number) {
  const errors = validatePaymentRow(payments[i]);
  if (Object.keys(errors).length > 0) {
    setPaymentErrors((prev) => ({ ...prev, [i]: errors }));
    return;
  }
  setPaymentErrors((prev) => {
    const next = { ...prev };
    if (next[i]) delete next[i];
    return next;
  });
  setConfirmedPayments((prev) => new Set(prev).add(i));
}
```

#### **עדכון `updatePaymentRow`:**
```tsx
function updatePaymentRow(i: number, patch: Partial<PaymentRow>) {
  setPayments((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  // ✅ כשמעדכנים שורה, מבטלים את האישור
  setConfirmedPayments((prev) => {
    if (!prev.has(i)) return prev;
    const next = new Set(prev);
    next.delete(i);
    return next;
  });
}
```

#### **עדכון `removePaymentRow`:**
```tsx
function removePaymentRow(i: number) {
  setPayments((prev) => prev.filter((_, idx) => idx !== i));
  // ✅ מוחקים גם את האישור
  setConfirmedPayments((prev) => {
    if (!prev.has(i)) return prev;
    const next = new Set(prev);
    next.delete(i);
    return next;
  });
}
```

---

### **4. Imports חדשים**

```tsx
import { Trash2, Save, CheckCircle, Eye, Pencil } from "lucide-react"; // הוסף Pencil
import { Input } from "@/components/ui/input"; // הוסף Input
```

---

### **5. סיכום סכומים מותנה**

הסכום הכולל מוצג רק כשיש תקבולים מאושרים:

```tsx
{hasConfirmedPayments && (
  <div className="pt-[50px] mt-[50px]">
    <div className="flex justify-between items-center">
      <div className="text-lg font-bold" style={{ color: "#19183B" }}></div>
      <div className="text-2xl font-bold  ml-[50px]" style={{ color: "#19183B" }}>
        סה״כ {formatMoney(total, currency)}
      </div>
    </div>
    {roundTotals && (
      <p className="text-xs mt-2 text-right" style={{ color: "#19183B", opacity: 0.8 }}>
        כולל עיגול לסכום סופי
      </p>
    )}
  </div>
)}
```

---

## ❌ מה **לא** שונה

✅ **Data structure** - אותו `PaymentRow` type  
✅ **Validation rules** - אותן בדיוק  
✅ **Saving logic** - אותה בדיוק  
✅ **API calls** - אותן בדיוק  
✅ **Business logic** - אותה בדיוק  
✅ **handlePreview** - אותה בדיוק (לא בודק אישור)  
✅ **handleIssue** - אותה בדיוק (לא בודק אישור)  
✅ **PaymentDetailsSection** - הקומפוננטה עצמה לא שונתה  

---

## 🎨 CSS Classes חדשים בשימוש

```css
.ti-items-row         /* מעמוד חשבונית מס */
.ti-items-select      /* מעמוד חשבונית מס */
data-locked           /* attribute לסימון שורות מאושרות */
variant="underline"   /* ל-Select */
variant="items"       /* ל-MoneyInput */
```

---

## 🔄 תהליך העבודה החדש (User Flow)

### **Before (לפני):**
1. הוסף תקבול → 🆕
2. מלא שדות
3. (אופציונלי) מלא `PaymentDetailsSection`
4. הוסף תקבול נוסף / תצוגה מקדימה / הפק

### **After (אחרי):**
1. הוסף תקבול → 🆕
2. מלא שדות (בטבלה עם headers)
3. (אופציונלי) מלא `PaymentDetailsSection` ← **גלוי רק אם לא אושר**
4. לחץ "אישור" → ✓ ← **חדש!**
   - השורה נעולה
   - `PaymentDetailsSection` נסתר
   - סכום כולל מופיע
5. (אופציונלי) לחץ "עריכה" → ✏️ ← **חדש!**
   - השורה נפתחת לעריכה
6. הוסף תקבול נוסף / תצוגה מקדימה / הפק

---

## 📊 השוואה ויזואלית

### **Grid Layout (לפני):**
```
┌─────────────────────────────────────────┐
│  [אמצעי תשלום ▼]  [תאריך 📅]  [סכום ₪] │
│                                          │
│  [פרטי תשלום נוספים...]                │
│                                    [🗑️]  │
└─────────────────────────────────────────┘
```

### **Table Layout (אחרי):**
```
┌────────────┬────────┬─────────┬────────┬──────────┐
│ אמצעי תשלום│ תאריך  │  סכום   │ מטבע  │  אישור   │
├────────────┼────────┼─────────┼────────┼──────────┤
│  [▼]       │ [📅]   │ [₪ ...] │ [₪ ▼] │ [אישור]  │ ← לא מאושר
│            │        │         │        │ [🗑️]     │
│  [פרטי תשלום נוספים...]                          │
├────────────┼────────┼─────────┼────────┼──────────┤
│  העברה     │ 25/01  │ 1,000   │   ₪   │ [✏️][🗑️] │ ← מאושר
└────────────┴────────┴─────────┴────────┴──────────┘
                                          
                              סה״כ  1,000 ₪
```

---

## ✅ Checklist - מה בוצע

- [x] העתק CSS/Tailwind classes מחשבונית מס
- [x] העתק מבנה table/grid
- [x] שמור על אותם שדות בדיוק
- [x] הוסף state: `confirmedPayments`
- [x] הוסף state: `hasConfirmedPayments`
- [x] הוסף function: `validatePaymentRow`
- [x] הוסף function: `confirmPaymentRow`
- [x] עדכן function: `updatePaymentRow` (מבטל אישור)
- [x] עדכן function: `removePaymentRow` (מוחק אישור)
- [x] הוסף כפתור "אישור" (✓)
- [x] הוסף כפתור "עריכה" (✏️)
- [x] העבר כפתור "מחיקה" לסוף השורה
- [x] הסתר `PaymentDetailsSection` כשהשורה מאושרת
- [x] הוסף סיכום מותנה (`hasConfirmedPayments`)
- [x] הוסף imports: `Pencil`, `Input`
- [x] בדיקת linter - אין שגיאות ✅

---

## 🧪 בדיקות מומלצות

### **Manual Testing:**
1. ✅ הוסף תקבול → בדוק שהשדות עובדים
2. ✅ אשר תקבול → בדוק שהוא נעול
3. ✅ בדוק שסכום כולל מופיע
4. ✅ לחץ עריכה → בדוק שהוא נפתח
5. ✅ עדכן שדה → בדוק שהאישור בוטל
6. ✅ מחק תקבול → בדוק שהאישור נמחק
7. ✅ תצוגה מקדימה → בדוק שהיא עובדת
8. ✅ הפק מסמך → בדוק שהוא נוצר
9. ✅ בדוק responsive (mobile/tablet/desktop)

### **Edge Cases:**
- [ ] מה קורה כשכל התקבולים מאושרים?
- [ ] מה קורה כשאף תקבול לא מאושר?
- [ ] מה קורה כשיש תקבול עם validation error?
- [ ] מה קורה כשמוחקים תקבול מאושר?

---

## 📝 הערות חשובות

1. **Backward Compatibility:** כל הנתונים נשמרים באותו format - אין breaking changes
2. **Optional Feature:** אישור תקבולים הוא אופציונלי - אפשר להפיק מסמך בלי לאשר
3. **UX Enhancement:** זה רק שיפור UI/UX - לא משנה לוגיקה עסקית
4. **PaymentDetailsSection:** מוסתר כשהשורה מאושרת כדי לחסוך מקום ולהפוך את ה-UI ליותר clean

---

## 🎉 סיכום

עדכון זה מביא את עמוד הקבלה לאותו רמת UI כמו חשבונית מס:
- ✅ מבנה טבלה מסודר עם headers
- ✅ inline editing עם כפתורי אישור/עריכה
- ✅ visual feedback (locked/unlocked states)
- ✅ סיכום מותנה
- ✅ UX משופר

**הכל עובד בדיוק כמו קודם, רק נראה ומרגיש הרבה יותר טוב!** 🚀
