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
    <Link href={href} className="group h-full block">
      <Card className="h-full transition-all hover:shadow-lg hover:border-primary cursor-pointer">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 p-3 bg-primary/10 group-hover:bg-primary/20 rounded-ui transition-colors">
              <div className="text-primary">
                <Icon className="h-6 w-6" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-card-fg mb-1.5 group-hover:text-primary transition-colors">
                {title}
              </h3>
              <p className="text-sm text-muted-fg leading-relaxed">
                {description}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
