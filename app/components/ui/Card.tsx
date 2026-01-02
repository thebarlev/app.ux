import React from "react";

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/5 p-6 shadow-sm ${className}`}
      {...props}
    />
  );
}
