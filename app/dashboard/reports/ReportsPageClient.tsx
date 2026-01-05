"use client";

import { useState } from "react";
import { FileText, TrendingUp, TrendingDown, Receipt, CreditCard, Calculator } from "lucide-react";
import ReportCard from "./ReportCard";
import IncomeReportModal from "./IncomeReportModal";

type ReportType = "income" | "expenses" | "profit-loss" | "vat" | "advances";

const REPORTS = [
  {
    id: "income" as ReportType,
    title: "דוח הכנסות",
    description: "דוח זה מרכז את כל נתוני ההכנסות שהתקבלו בעסק, כולל חשבוניות וקבלות, ומאפשר לך הפקה נוחה לפי תקופה ולקוח ספציפי.",
    icon: TrendingUp,
    color: "bg-gradient-to-br from-green-500 to-emerald-600",
    enabled: true,
  },
  {
    id: "expenses" as ReportType,
    title: "דוח הוצאות",
    description: "הדוח מציג את כל ההוצאות והתשלומים שביצעת, לרבות קבלות ספקים וחשבוניות רכש, לשליטה מלאה על מבנה העלויות בעסק.",
    icon: TrendingDown,
    color: "bg-gradient-to-br from-red-500 to-rose-600",
    enabled: false,
  },
  {
    id: "profit-loss" as ReportType,
    title: "דוח רווח והפסד",
    description: "ניתוח כלכלי מקיף המשווה את ההכנסות מול ההוצאות, ומציג את התמונה העסקית השנתית או החודשית שלך בצורה ברורה.",
    icon: Calculator,
    color: "bg-gradient-to-br from-blue-500 to-indigo-600",
    enabled: false,
  },
  {
    id: "vat" as ReportType,
    title: "דוח מע״מ",
    description: "דוח מפורט המרכז את כל הנתונים הנדרשים לצורך הגשת דוחות מע״מ לרשויות, עם פירוט של עסקאות חייבות ומוטבות.",
    icon: FileText,
    color: "bg-gradient-to-br from-purple-500 to-violet-600",
    enabled: false,
  },
  {
    id: "advances" as ReportType,
    title: "דוח מקדמות",
    description: "מעקב אחר כל התשלומים שהתקבלו כמקדמות, תשלומים על חשבון, והתאמותיהם לחשבוניות הסופיות שהופקו ללקוחות.",
    icon: CreditCard,
    color: "bg-gradient-to-br from-orange-500 to-amber-600",
    enabled: false,
  },
];

export default function ReportsPageClient() {
  const [activeModal, setActiveModal] = useState<ReportType | null>(null);

  const handleReportClick = (reportId: ReportType) => {
    if (reportId === "income") {
      setActiveModal("income");
    } else {
      // TODO: Implement other reports
      alert("דוח זה יהיה זמין בקרוב");
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black ui-text-dark mb-2">דוחות והנהלת חשבונות</h1>
        <p className="text-sm ui-text-dark-muted">
          הפק דוחות חשבונאיים מקצועיים לניהול ולדיווח עסקי מיטבי
        </p>
      </div>

      {/* Reports Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <ReportCard
            key={report.id}
            title={report.title}
            description={report.description}
            icon={report.icon}
            color={report.color}
            enabled={report.enabled}
            onGenerate={() => handleReportClick(report.id)}
          />
        ))}
      </div>

      {/* Income Report Modal */}
      {activeModal === "income" && (
        <IncomeReportModal onClose={() => setActiveModal(null)} />
      )}
    </div>
  );
}
