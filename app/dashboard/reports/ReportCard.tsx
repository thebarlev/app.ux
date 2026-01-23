"use client";

import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
    <Card
      style={{
        backgroundColor: 'white',
        border: 'none',
        borderRadius: '20px',
        boxShadow: '0 0 13px 0 rgba(0,0,0,0.10)',
        minHeight: '280px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: enabled ? 'pointer' : 'default',
      }}
      onMouseEnter={(e) => {
        if (enabled) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 20px 0 rgba(0,0,0,0.15)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 0 13px 0 rgba(0,0,0,0.10)';
      }}
    >
      <CardContent style={{ padding: '30px', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Icon Header */}
        <div style={{ marginBottom: '20px' }}>
          <div
            className={`inline-flex p-3 rounded-xl ${color} shadow-lg`}
            style={{ borderRadius: '12px' }}
          >
            <Icon className="h-6 w-6" style={{ color: '#FFFFFF' }} />
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, marginBottom: '20px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#19183B', marginBottom: '12px' }}>
            {title}
          </h3>
          <p style={{ fontSize: '18px', color: '#708993', lineHeight: '1.6' }}>
            {description}
          </p>
        </div>

        {/* Action Button */}
        <div style={{ marginTop: 'auto' }}>
          <Button
            onClick={onGenerate}
            disabled={!enabled}
            style={{
              width: '100%',
              height: '50px',
              fontSize: '18px',
            }}
            type="button"
          >
            הפקת דוח
          </Button>
        </div>

        {/* Coming Soon Badge */}
        {!enabled && (
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '12px',
                backgroundColor: '#EDF1F5',
                color: '#708993',
              }}
            >
              בקרוב
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
