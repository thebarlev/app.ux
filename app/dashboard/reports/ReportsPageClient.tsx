"use client";

import { useRouter } from "next/navigation";
import { FileText, TrendingUp, TrendingDown, Receipt, CreditCard, Calculator } from "lucide-react";
import ReportCard from "./ReportCard";
import { Card, CardContent } from "@/components/ui/card";

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
  const router = useRouter();

  const handleReportClick = (reportId: ReportType) => {
    if (reportId === "income") {
      router.push("/dashboard/reports/income");
    } else {
      // TODO: Implement other reports
      alert("דוח זה יהיה זמין בקרוב");
    }
  };

  return (
    <main dir="rtl" className="min-h-screen" style={{ backgroundColor: '#EDF1F5' }}>
      <div className="ui-container pt-10">
        {/* Page Header */}
        <div className="mb-[50px]">
          <h1 className="text-right text-4xl font-semibold text-[#19183B] mb-4">
            דוחות והנהלת חשבונות
          </h1>
          <p className="text-right text-[#708993] text-lg">
            הפק דוחות חשבונאיים מקצועיים לניהול ולדיווח עסקי מיטבי
          </p>
        </div>

        {/* Reports Grid */}
        <div className="ui-cards-grid">
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
      </div>
    </main>
  );
}
