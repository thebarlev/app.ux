"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface DashboardCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function DashboardCard({ href, icon: Icon, title, description }: DashboardCardProps) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }} className="h-full block">
      <Card
        className="h-full flex items-center"
        style={{
          backgroundColor: 'white',
          border: 'none',
          borderRadius: '20px',
          boxShadow: '0 0 13px 0 rgba(0,0,0,0.10)',
          cursor: 'pointer',
          transition: 'transform 0.2s, box-shadow 0.2s',
          height: '160px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 20px 0 rgba(0,0,0,0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 0 13px 0 rgba(0,0,0,0.10)';
        }}
      >
        <CardContent style={{ padding: '30px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              position: 'relative',
              flexShrink: 0,
            }}>
              {/* Icon with two-tone gradient effect */}
              <div style={{ position: 'relative', width: '32px', height: '32px' }}>
                {/* Base layer - primary teal color */}
                <Icon 
                  size={32} 
                  style={{ 
                    color: '#5389BB',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                  }} 
                />
                {/* Overlay layer - orange, clipped to show gradient effect */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '32px',
                  height: '32px',
                  clipPath: 'inset(0 0 0 50%)',
                }}>
                  <Icon 
                    size={32} 
                    style={{ 
                      color: '#F39600',
                    }} 
                  />
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#19183B', marginBottom: '8px' }} className="truncate">
                {title}
              </div>
              <div style={{ fontSize: '18px', color: '#708993' }} className="truncate">
                {description}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
