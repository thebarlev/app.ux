"use client";

import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/* Updated to use Design Tokens - Jan 5, 2026 */

interface ReportCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  enabled: boolean;
  onGenerate: () => void;
}

export default function ReportCard({
  title,
  description,
  icon: Icon,
  color,
  enabled,
  onGenerate,
}: ReportCardProps) {
  return (
    <div
      className="bg-card text-card-fg border border-border rounded-ui p-6 flex flex-col h-full transition-all duration-200 hover:border-primary"
      style={{ minHeight: "280px" }}
    >
      {/* Icon Header */}
      <div className="mb-4">
        <div className={`inline-flex p-3 rounded-xl ${color} shadow-lg`}>
          <Icon className="h-6 w-6 text-primary-fg" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 mb-4">
        <h3 className="text-xl font-bold text-card-fg mb-2">{title}</h3>
        <p className="text-sm text-muted-fg leading-relaxed">{description}</p>
      </div>

      {/* Action Button */}
      <div className="mt-auto">
        <Button
          onClick={onGenerate}
          disabled={!enabled}
          className="w-full bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-50"
          type="button"
        >
          הפקת דוח
        </Button>
      </div>

      {/* Coming Soon Badge */}
      {!enabled && (
        <div className="mt-3 text-center">
          <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-muted text-muted-fg">
            בקרוב
          </span>
        </div>
      )}
    </div>
  );
}
