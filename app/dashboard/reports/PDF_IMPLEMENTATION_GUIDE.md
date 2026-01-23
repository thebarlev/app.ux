# 📊 מערכת הפקת דוחות PDF - דוח הכנסות

## ✅ מה כבר מממומש

### 1. **Server Actions** (`actions.ts`)
- ✅ פיצול טווח תאריכים לחודשים (`splitIntoMonthlyRanges`)
- ✅ שליפת מסמכים מה-DB עם סינונים
- ✅ חישוב סיכומים (הכנסות, תקבולים, מע״מ)
- ✅ יצירת metadata לכל חודש
- ✅ שמות קבצים בפורמט: `Income.<businessId>.<DD.MM.YYYY>-<DD.MM.YYYY>.pdf`

### 2. **UI Integration** (`IncomeReportModal.tsx`)
- ✅ קריאה ל-action עם כל הפרמטרים
- ✅ הצגת סיכום לאחר הפקה
- ✅ טיפול בשגיאות

### 3. **Business Logic**
- ✅ פורמט תאריכים: DD/MM/YYYY (UI), DD.MM.YYYY (filename)
- ✅ פורמט כסף: ₪ עם 2 ספרות + הפרדת אלפים
- ✅ סיכום תקבולים לפי אמצעי תשלום
- ✅ סיכום הכנסות (חייב/פטור/מע״מ/ניכוי)

---

## 🚧 מה נותר לממש - יצירת PDF בפועל

### שלב 1: התקנת ספריות PDF

נבחר ב-**jsPDF + autoTable** כי הם:
- תומכים ב-RTL מלא
- קלים לשימוש
- יש להם תמיכה בפונטים עבריים

```bash
pnpm add jspdf jspdf-autotable
pnpm add -D @types/jspdf @types/jspdf-autotable
```

### שלב 2: הוספת פונט עברי

1. הורד פונט עברי (למשל: Rubik, Heebo, Assistant)
2. המר ל-base64 או ttf
3. הוסף ל-jsPDF

**קובץ דוגמה**: `/lib/pdf/fonts.ts`
```typescript
export const HEBREW_FONT_BASE64 = "..." // הפונט ב-base64
```

### שלב 3: פונקציית יצירת PDF

**קובץ חדש**: `/lib/pdf/generate-income-pdf.ts`

```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PDFData {
  company: {
    name: string;
    taxId: string;
    address: string;
    phone: string;
    email: string;
  };
  period: {
    from: string; // DD/MM/YYYY
    to: string;
  };
  summary: {
    income_total_inc_vat: number;
    paid_total: number;
    // ... כל השדות מ-calculateSummary
  };
  documents: any[]; // המסמכים המלאים
  generatedAt: string; // ISO date
}

export async function generateIncomePDF(data: PDFData): Promise<Uint8Array> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // הוסף פונט עברי
  // doc.addFont(HEBREW_FONT_BASE64, 'Rubik', 'normal');
  // doc.setFont('Rubik');
  doc.setR2L(true); // RTL mode

  let yPos = 20;

  // ===== 1. כותרת עליונה =====
  doc.setFontSize(20);
  doc.text('דיווח הכנסות תקופתי', 105, yPos, { align: 'center' });
  yPos += 10;

  doc.setFontSize(12);
  doc.text(`לתקופה ${data.period.to} - ${data.period.from}`, 105, yPos, { align: 'center' });
  yPos += 15;

  // ===== 2. פרטי עסק =====
  doc.setFontSize(10);
  const companyX = 150; // RTL - מתחיל מימין
  doc.text(data.company.name, companyX, yPos, { align: 'right' });
  yPos += 5;
  doc.text(`ח.פ: ${data.company.taxId}`, companyX, yPos, { align: 'right' });
  yPos += 5;
  doc.text(data.company.address, companyX, yPos, { align: 'right' });
  yPos += 5;
  doc.text(`טל: ${data.company.phone}`, companyX, yPos, { align: 'right' });
  yPos += 10;

  // ===== 3. סיכום כללי (מלבנים) =====
  doc.setFillColor(220, 220, 255);
  doc.rect(20, yPos, 80, 15, 'F');
  doc.setFontSize(14);
  doc.text('סה״כ הכנסות', 60, yPos + 5, { align: 'center' });
  doc.setFontSize(16);
  doc.text(formatMoney(data.summary.income_total_inc_vat), 60, yPos + 12, { align: 'center' });

  doc.rect(110, yPos, 80, 15, 'F');
  doc.setFontSize(14);
  doc.text('סה״כ תקבולים', 150, yPos + 5, { align: 'center' });
  doc.setFontSize(16);
  doc.text(formatMoney(data.summary.paid_total), 150, yPos + 12, { align: 'center' });
  yPos += 25;

  // ===== 4. טבלת סיכום הכנסות ותקבולים =====
  doc.setFontSize(14);
  doc.text(`סיכום הכנסות ותקבולים (${data.documents.length} מסמכים)`, 105, yPos, { align: 'center' });
  yPos += 10;

  // טבלה דו-עמודתית
  autoTable(doc, {
    startY: yPos,
    head: [['סיכום תקבולים', 'סיכום הכנסות']],
    body: [
      [`העברות בנקאיות: ${formatMoney(data.summary.bank_transfer)}`, `הכנסות חייבות: ${formatMoney(data.summary.income_taxable)}`],
      [`כרטיסי אשראי: ${formatMoney(data.summary.credit_card)}`, `הכנסות פטורות: ${formatMoney(data.summary.income_exempt)}`],
      [`צ'קים: ${formatMoney(data.summary.check)}`, `מע״מ: ${formatMoney(data.summary.vat_total)}`],
      [`מזומן: ${formatMoney(data.summary.cash)}`, `ניכוי במקור: ${formatMoney(data.summary.withholding_tax)}`],
      [`פייפאל: ${formatMoney(data.summary.paypal)}`, ``],
      [`אפליקציות תשלום: ${formatMoney(data.summary.payment_apps)}`, ``],
      [`סה״כ שולם: ${formatMoney(data.summary.paid_total)}`, `סה״כ כולל מע״מ: ${formatMoney(data.summary.income_total_inc_vat)}`],
    ],
    theme: 'grid',
    styles: { 
      font: 'Rubik',
      halign: 'right',
      fontSize: 10,
    },
    headStyles: {
      fillColor: [100, 150, 200],
      textColor: [255, 255, 255],
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // ===== 5. פירוט מסמכים לפי סוג =====
  const docsByType = groupDocumentsByType(data.documents);

  Object.entries(docsByType).forEach(([docType, docs]) => {
    doc.addPage(); // עמוד חדש לכל סוג מסמך
    yPos = 20;

    doc.setFontSize(14);
    doc.text(`${docType} (${docs.length} מסמכים)`, 105, yPos, { align: 'center' });
    yPos += 10;

    // טבלת מסמכים
    const tableData = docs.map((d: any) => [
      d.document_number,
      formatDate(d.issue_date),
      `${d.customers?.name}\n${d.customers?.tax_id || ''}`,
      d.id.slice(0, 8),
      formatMoney(d.subtotal || 0),
      formatMoney(0), // פטור
      formatMoney((d.total_amount || 0) - (d.subtotal || 0)), // מע״מ
      formatMoney(d.total_amount || 0),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['מס׳', 'תאריך', 'פרטי לקוח', 'מספר הקצאה', 'חייב מע״מ', 'פטור', 'מע״מ', 'סה״כ']],
      body: tableData,
      theme: 'striped',
      styles: {
        font: 'Rubik',
        halign: 'right',
        fontSize: 9,
      },
      headStyles: {
        fillColor: [100, 150, 200],
      },
    });
  });

  // ===== 6. Footer - בכל עמוד =====
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    const generatedText = `הופק ב ${formatDateTime(data.generatedAt)}`;
    doc.text(generatedText, 105, 285, { align: 'center' });
    doc.text(`עמוד ${i} מתוך ${pageCount}`, 105, 290, { align: 'center' });
  }

  return doc.output('arraybuffer');
}

// Helper functions
function formatMoney(amount: number): string {
  return `₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${time} ${formatDate(isoStr)}`;
}

function groupDocumentsByType(documents: any[]) {
  return documents.reduce((acc, doc) => {
    const type = doc.document_type || 'אחר';
    if (!acc[type]) acc[type] = [];
    acc[type].push(doc);
    return acc;
  }, {} as Record<string, any[]>);
}
```

### שלב 4: שילוב ב-Action

עדכן את `generateIncomeReportAction` ב-`actions.ts`:

```typescript
import { generateIncomePDF } from '@/lib/pdf/generate-income-pdf';

// בתוך הלולאה על monthlySegments:
for (const segment of monthlySegments) {
  const documents = await getDocumentsForRange(...);
  const summary = calculateSummary(documents);
  
  // יצירת PDF
  const pdfBuffer = await generateIncomePDF({
    company: {
      name: company.company_name,
      taxId: company.registration_number,
      address: company.address,
      phone: company.mobile_phone,
      email: company.email,
    },
    period: {
      from: formatDate(segment.from),
      to: formatDate(segment.to),
    },
    summary,
    documents,
    generatedAt: new Date().toISOString(),
  });
  
  reports.push({
    filename,
    pdfBuffer, // <-- הוסף את ה-buffer
    month: segment.month,
    // ...
  });
}

// אם יש יותר מדוח אחד - צור ZIP
if (reports.length > 1) {
  // השתמש ב-JSZip
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  
  reports.forEach(r => {
    zip.file(r.filename, r.pdfBuffer);
  });
  
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const zipFilename = `Income.${company.registration_number}.${formatDateFilename(params.startDate)}-${formatDateFilename(params.endDate)}.zip`;
  
  return {
    ok: true,
    isZip: true,
    filename: zipFilename,
    buffer: zipBuffer,
    reports,
  };
} else {
  // דוח יחיד
  return {
    ok: true,
    isZip: false,
    filename: reports[0].filename,
    buffer: reports[0].pdfBuffer,
    reports,
  };
}
```

### שלב 5: הורדה בצד הלקוח

עדכן את `handleSubmit` ב-`IncomeReportModal.tsx`:

```typescript
if (result.ok) {
  // צור Blob והורד
  const blob = new Blob([result.buffer], { 
    type: result.isZip ? 'application/zip' : 'application/pdf' 
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  a.click();
  URL.revokeObjectURL(url);
  
  alert(`הדוח הופק בהצלחה!`);
  onClose();
}
```

---

## 📦 התקנות נדרשות

```bash
# ספריות PDF
pnpm add jspdf jspdf-autotable

# ספריית ZIP (אם יש יותר מחודש אחד)
pnpm add jszip

# Types
pnpm add -D @types/jspdf @types/jspdf-autotable @types/jszip
```

---

## 🎨 עיצוב נוסף

### 1. **לוגו בכותרת**
```typescript
// הוסף תמונת לוגו (base64)
const logoBase64 = "data:image/png;base64,..."
doc.addImage(logoBase64, 'PNG', 150, 10, 40, 20);
```

### 2. **צבעים מותאמים אישית**
```typescript
headStyles: {
  fillColor: [100, 173, 241], // כחול מותאם
  textColor: [255, 255, 255],
}
```

### 3. **סגנון RTL מושלם**
```typescript
doc.setLanguage('he');
doc.setR2L(true);
```

---

## 🧪 בדיקות מומלצות

- ✅ חודש בודד עם 0 מסמכים
- ✅ טווח של 12 חודשים (12 PDF-ים ב-ZIP)
- ✅ מסמכים עם ניכוי במקור
- ✅ מסמכים מעורבים (חייב+פטור)
- ✅ שמות לקוחות עם תווים מיוחדים
- ✅ סכומים גדולים (בדיקת overflow)

---

## 📨 שליחה במייל (אופציונלי)

אם המשתמש הזין מיילים, שלח את הקבצים:

```typescript
// השתמש ב-Resend / SendGrid / Supabase Email
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'reports@yourcompany.com',
  to: params.emails,
  subject: `דוח הכנסות ${formatDate(params.startDate)} - ${formatDate(params.endDate)}`,
  html: `<p>שלום,</p><p>מצורף דוח ההכנסות המבוקש.</p>`,
  attachments: reports.map(r => ({
    filename: r.filename,
    content: Buffer.from(r.pdfBuffer).toString('base64'),
  })),
});
```

---

## ✅ Checklist סופי

- [ ] התקן jsPDF + autoTable + jszip
- [ ] צור `/lib/pdf/generate-income-pdf.ts`
- [ ] הוסף פונט עברי (Rubik/Heebo)
- [ ] עדכן `actions.ts` להחזיר buffers
- [ ] עדכן `IncomeReportModal.tsx` להוריד קבצים
- [ ] בדוק RTL בכל הטבלאות
- [ ] בדוק pagination (עמוד X מתוך Y)
- [ ] בדוק ZIP אם יש >1 חודש
- [ ] הוסף footer "הופק ב..."
- [ ] בדוק מסמכים עם ניכוי במקור

---

## 🚀 סיכום

המערכת מוכנה ל-80%! נותר רק:
1. התקנת ספריות PDF
2. יצירת פונקציית `generateIncomePDF`
3. שילוב ההורדה

הכל מוכן ומובנה - פשוט תעקוב אחרי ה-README הזה צעד אחר צעד! 🎉
