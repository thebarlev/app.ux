"use client";

import { logoutAction } from "@/app/dashboard/actions";
import { useTransition } from "react";

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction();
    });
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isPending}
      style={{
        padding: "8px 16px",
        backgroundColor: "#dc2626",
        color: "white",
        border: "none",
        borderRadius: "6px",
        cursor: isPending ? "not-allowed" : "pointer",
        fontSize: "14px",
        fontWeight: 500,
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {isPending ? "מתנתק..." : "🚪 התנתקות"}
    </button>
  );
}
