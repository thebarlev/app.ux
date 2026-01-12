"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ReceiptSettingsSummaryProps {
  settings: {
    currency: string;
    language: "he" | "en";
    vatType: string;
    roundTotals: boolean;
    allowedCurrencies?: string[];
    allowedLanguages?: { value: "he" | "en"; label: string }[];
    canEdit?: {
      currency?: boolean;
      language?: boolean;
      vatType?: boolean;
      roundTotals?: boolean;
    };
    settingsLinks?: {
      currency?: string;
      language?: string;
      vatType?: string;
      roundTotals?: string;
    };
  };
  onChange: (patch: Partial<ReceiptSettingsSummaryProps["settings"]>) => void;
}

export default function ReceiptSettingsSummary({ settings, onChange }: ReceiptSettingsSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  // Short summary string with dot separators (removed VAT)
  const summary = [
    `מטבע: ${settings.currency}`,
    `שפה: ${settings.language === "he" ? "עברית" : "English"}`,
  ].join(" · ");

  return (
    <Card
      className={cn(
        "w-full flex flex-col mb-6 transition-all duration-200",
        expanded ? "bg-white rounded-[20px] shadow-sm" : "bg-transparent rounded-none shadow-xs"
      )}
      style={{ fontSize: 14, direction: "rtl", boxShadow: 'none', border: 'none', paddingLeft: 0, paddingRight: 0 }}
      aria-expanded={expanded}
    >
      <button
        type="button"
        className={cn(
          "flex items-center justify-between w-full py-3 cursor-pointer select-none bg-transparent border-0 outline-none",
          "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring rounded-t-2xl transition-colors"
        )}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* פירוט תקציר בצד ימין - מוסתר כשההגדרות פתוחות */}
        {!expanded && (
          <span className="flex-1 text-right text-muted-foreground text-[14px] font-normal whitespace-nowrap overflow-x-auto rtl:pr-0 rtl:pl-2">
            {summary}
          </span>
        )}
        {/* כותרת לעריכת ההגדרות בצד שמאל */}
        <span className="font-semibold text-primary text-[15px] ml-3">לעריכת ההגדרות</span>
        <span className="ml-2">
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </button>
      {expanded && (
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 border-t border-border bg-white rounded-b-[20px]">
          {/* Currency */}
          <div className="flex flex-col gap-1 min-w-[120px]">
            <span className="text-muted-foreground mb-1">מטבע</span>
            {settings.canEdit?.currency ? (
              <Select value={settings.currency} onValueChange={(v) => onChange({ currency: v })}>
                <SelectTrigger className="h-8 text-[14px]" style={{ color: '#708993' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(settings.allowedCurrencies || [settings.currency]).map((c) => (
                    <SelectItem key={c} value={c} className="text-[14px]">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span style={{ color: '#708993' }}>
                {settings.currency}
                {settings.settingsLinks?.currency && (
                  <a href={settings.settingsLinks.currency} className="ml-2 underline text-primary text-xs" tabIndex={0} target="_blank" rel="noopener noreferrer">
                    ערוך בהגדרות
                  </a>
                )}
              </span>
            )}
          </div>
          {/* Language */}
          <div className="flex flex-col gap-1 min-w-[120px]">
            <span className="text-muted-foreground mb-1">שפה</span>
            {settings.canEdit?.language ? (
              <Select value={settings.language} onValueChange={(v) => onChange({ language: v as "he" | "en" })}>
                <SelectTrigger className="h-8 text-[14px]" style={{ color: '#708993' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(settings.allowedLanguages || [
                    { value: "he", label: "עברית" },
                    { value: "en", label: "English" },
                  ]).map((l) => (
                    <SelectItem key={l.value} value={l.value} className="text-[14px]">
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span style={{ color: '#708993' }}>
                {settings.language === "he" ? "עברית" : "English"}
                {settings.settingsLinks?.language && (
                  <a href={settings.settingsLinks.language} className="ml-2 underline text-primary text-xs" tabIndex={0} target="_blank" rel="noopener noreferrer">
                    ערוך בהגדרות
                  </a>
                )}
              </span>
            )}
          </div>
          {/* Round Totals */}
          <div className="flex flex-col gap-1 min-w-[120px] items-center justify-center">
            <span className="text-muted-foreground mb-2">עיגול סכום</span>
            {settings.canEdit?.roundTotals ? (
              <button
                type="button"
                className={cn(
                  "w-14 h-7 rounded-full flex items-center transition-colors relative",
                  settings.roundTotals ? "bg-[#1D868F]" : "bg-muted"
                )}
                style={{ border: 'none', padding: 0 }}
                onClick={() => onChange({ roundTotals: !settings.roundTotals })}
                aria-pressed={settings.roundTotals}
                tabIndex={0}
              >
                <span
                  className={cn(
                    "block w-6 h-6 rounded-full bg-card shadow absolute transition-all duration-200",
                  )}
                  style={{
                    right: settings.roundTotals ? '4px' : 'calc(100% - 28px)',
                    left: settings.roundTotals ? 'calc(100% - 28px)' : '4px',
                    top: '0.5px',
                  }}
                />
                <span className="sr-only">הפעל/כבה עיגול סכום</span>
              </button>
            ) : (
              <span style={{ color: '#708993' }}>
                {settings.roundTotals ? "כן" : "לא"}
                {settings.settingsLinks?.roundTotals && (
                  <a href={settings.settingsLinks.roundTotals} className="ml-2 underline text-primary text-xs" tabIndex={0} target="_blank" rel="noopener noreferrer">
                    ערוך בהגדרות
                  </a>
                )}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
