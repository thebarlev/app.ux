# Receipt Payment Details - Single Row Layout

**תאריך:** 25 ינואר 2026  
**מטרה:** שינוי פריסת פירוט התקבולים מ-2 שורות לשורה אחת מאוחדת

---

## 📐 **הארכיטקטורה החדשה**

### **פריסת העמודות (באחוזים):**

```
┌──────────────┬────────┬────────┬────────┬──────────────────────────────┬──────────┐
│ אמצעי תשלום │ תאריך  │ סכום   │ מטבע   │    פרטים נוספים              │ פעולות   │
│    14%       │  8%    │  8%    │  8%    │       47%                    │   10%    │
└──────────────┴────────┴────────┴────────┴──────────────────────────────┴──────────┘
```

### **דוגמה חיה - העברה בנקאית:**

```
┌──────────────┬────────┬────────┬────────┬──────────────────────────────┬──────────┐
│ העברה בנק ▼  │25/1/26 │ 5000   │ ₪  ▼  │ [בנק לאומי][123][456789]    │ [✓][🗑️] │
└──────────────┴────────┴────────┴────────┴──────────────────────────────┴──────────┘
```

### **דוגמה חיה - כרטיס אשראי:**

```
┌──────────────┬────────┬────────┬────────┬─────────────────────────────────┬──────────┐
│ כרטיס אשר ▼  │25/1/26 │ 3000   │ ₪  ▼  │[1234][Visa▼][תשלומים▼][6]     │ [✓][🗑️] │
└──────────────┴────────┴────────┴────────┴─────────────────────────────────┴──────────┘
```

---

## 🔧 **שינויים טכניים**

### **1. קובץ: `PaymentDetailsSection.tsx`**

#### **הוספת פרופ חדש:**
```typescript
type PaymentDetailsSectionProps = {
  payment: PaymentRow;
  onUpdate: (updates: Partial<PaymentRow>) => void;
  isConfirmed?: boolean;
  onConfirm?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  renderMode?: "default" | "inline"; // ← חדש!
};
```

#### **מצב Inline - רינדור בשורה אחת:**

**כרטיס אשראי (4 שדות):**
```tsx
if (renderMode === "inline" && method === "כרטיס אשראי") {
  return (
    <div className="flex gap-2 min-w-0">
      <Input placeholder="4 ספרות" className="flex-1 min-w-[60px]" />
      <Select className="flex-1 min-w-[80px]">סוג כרטיס</Select>
      <Select className="flex-1 min-w-[80px]">סוג עסקה</Select>
      <Input placeholder="תשלומים" className="flex-1 min-w-[60px]" />
    </div>
  );
}
```

**העברה בנקאית (3 שדות):**
```tsx
if (renderMode === "inline" && method === "העברה בנקאית") {
  return (
    <div className="flex gap-2 min-w-0">
      <Input placeholder="בנק" className="flex-1 min-w-[80px]" />
      <Input placeholder="סניף" className="flex-1 min-w-[60px]" />
      <Input placeholder="חשבון" className="flex-1 min-w-[100px]" />
    </div>
  );
}
```

**Digital Wallets - Bit, PayBox וכו' (2 שדות):**
```tsx
if (renderMode === "inline" && (method === "Bit" || ...)) {
  return (
    <div className="flex gap-2 min-w-0">
      <Input placeholder="חשבון משלם" className="flex-1" />
      <Input placeholder="מספר עסקה" className="flex-1" />
    </div>
  );
}
```

**Payoneer / ניכויים / קריפטו (שדה אחד):**
```tsx
if (renderMode === "inline" && method === "Payoneer") {
  return (
    <Input 
      placeholder="מספר עסקה" 
      className="ti-items-input text-right w-full" 
    />
  );
}
```

**ניכוי במקור (הסבר בלבד):**
```tsx
if (renderMode === "inline" && method === "ניכוי במקור") {
  return (
    <div className="text-xs text-warning-fg bg-warning/10 px-3 py-2 rounded">
      הסכום ששולם למס הכנסה על ידי הלקוח
    </div>
  );
}
```

**מזומן (אין שדות נוספים):**
```tsx
if (renderMode === "inline" && method === "מזומן") {
  return null; // אין שדות נוספים
}
```

---

### **2. קובץ: `ReceiptFormClient.tsx`**

#### **שינוי הגריד הראשי:**

**לפני (2 שורות):**
```tsx
// שורה 1: אמצעי תשלום | תאריך | סכום | מטבע
<div className="grid grid-cols-[1.5fr_1fr_1.5fr_0.8fr] gap-4">
  <Select>אמצעי תשלום</Select>
  <Input type="date">תאריך</Input>
  <MoneyInput>סכום</MoneyInput>
  <Select>מטבע</Select>
</div>

// שורה 2 (mt-[50px]): פרטים נוספים + כפתורים
<div className="mt-[50px]">
  <PaymentDetailsSection ... />
</div>
```

**אחרי (שורה אחת מאוחדת):**
```tsx
<div className="grid grid-cols-[14%_8%_8%_8%_47%_10%] gap-3 items-center">
  {/* 14% - אמצעי תשלום */}
  <Select>...</Select>
  
  {/* 8% - תאריך */}
  <Input type="date">...</Input>
  
  {/* 8% - סכום */}
  <MoneyInput>...</MoneyInput>
  
  {/* 8% - מטבע */}
  <Select>...</Select>
  
  {/* 47% - פרטים נוספים */}
  <div className="min-w-0">
    <PaymentDetailsSection 
      payment={row}
      onUpdate={(updates) => updatePaymentRow(i, updates)}
      isConfirmed={confirmedPayments.has(i)}
      renderMode="inline" // ← מצב חדש
    />
  </div>
  
  {/* 10% - כפתורי פעולה */}
  <div className="flex items-center justify-center gap-1">
    {confirmedPayments.has(i) ? (
      <Button size="icon" onClick={...}><Pencil /></Button>
    ) : (
      <Button size="sm">✓</Button>
    )}
    <Button size="icon"><Trash2 /></Button>
  </div>
</div>
```

#### **עדכון כותרות העמודות:**
```tsx
<div className="grid grid-cols-[14%_8%_8%_8%_47%_10%] gap-3 items-center font-semibold">
  <div>אמצעי תשלום</div>
  <div>תאריך</div>
  <div>סכום</div>
  <div>מטבע</div>
  <div>פרטים נוספים</div>  {/* ← עמודה חדשה */}
  <div className="text-center">פעולות</div>  {/* ← עמודה חדשה */}
</div>
```

---

## 📊 **התוצאה הסופית**

### **✅ יתרונות:**

1. **חיסכון במקום** - שורה אחת במקום 2
2. **סריקה מהירה** - כל המידע בגובה עין אחד
3. **UX משופר** - הכפתורים תמיד נראים ומזוהים
4. **גמישות** - השדות הנוספים מתכווצים/מתרחבים בתוך ה-47%
5. **responsive** - ה-`min-w-*` מוודא שהשדות לא יתמוטטו

### **🎨 דוגמאות מלאות:**

#### **העברה בנקאית:**
```
[העברה בנקאית ▼] [25/01/26] [5000] [₪ ▼] [בנק לאומי | 123 | 456789] [✓][🗑️]
       14%             8%       8%      8%              47%                 10%
```

#### **כרטיס אשראי:**
```
[כרטיס אשראי ▼] [25/01/26] [3000] [₪ ▼] [1234|Visa▼|תשלומים▼|6] [✓][🗑️]
      14%            8%       8%      8%            47%              10%
```

#### **Bit:**
```
[Bit ▼] [25/01/26] [500] [₪ ▼] [0501234567 | TXN123456] [✓][🗑️]
  14%      8%       8%     8%           47%              10%
```

#### **מזומן:**
```
[מזומן ▼] [25/01/26] [1000] [₪ ▼] [                ] [✓][🗑️]
   14%       8%        8%     8%         47%            10%
                                    (ריק - אין שדות)
```

---

## ⚙️ **פרטים טכניים נוספים**

### **Styling:**
- כל השדות משתמשים ב-`ti-items-input` / `ti-items-select` לאחידות
- `flex gap-2` בתוך ה-47% ליצירת רווחים קטנים בין השדות
- `min-w-[XXpx]` למניעת קריסה של שדות קטנים
- `flex-1` לחלוקה שווה של השטח הפנוי

### **State Management:**
- `confirmedPayments: Set<number>` - מנהל את מצב האישור של כל שורה
- `disabled={isConfirmed}` - כל השדות הופכים ל-readonly אחרי אישור
- הכפתורים מתחלפים בין ✓ (אישור) ו-✏️ (עריכה)

### **Validation:**
- הוולידציה הקיימת נשארת זהה
- שדות חובה: אמצעי תשלום, תאריך, סכום
- הודעות שגיאה מוצגות בראש הסקשן

---

## 🧪 **בדיקות מומלצות**

1. ✅ בדוק שכל אמצעי תשלום מציג את השדות הנכונים
2. ✅ בדוק שהכפתורים ✓ ו-🗑️ עובדים
3. ✅ בדוק שאחרי אישור השדות הופכים ל-disabled
4. ✅ בדוק שכפתור העריכה (✏️) מבטל את ה-lock
5. ✅ בדוק responsive - מסכים קטנים/גדולים
6. ✅ בדוק שהוולידציה עובדת
7. ✅ בדוק שהסכום הכולל מחושב נכון

---

## 📝 **הערות חשובות**

1. **אין יותר mt-[50px]** - הכל בשורה אחת
2. **הכפתורים מוצגים תמיד** - גם לפני וגם אחרי אישור
3. **השדות הנוספים לא משפיעים על האחרים** - הם מוגבלים ל-47%
4. **מצב default נשמר** - ל-backward compatibility (אם נצטרך)

---

**סיכום:** המעבר לשורה אחת משפר משמעותית את חוויית המשתמש, חוסך מקום במסך, ומאפשר סריקה מהירה של כל פרטי התקבול.
