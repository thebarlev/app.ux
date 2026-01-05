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
      className="px-4 py-2 bg-danger text-danger-fg rounded-md font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isPending ? "מתנתק..." : "🚪 התנתקות"}
    </button>
  );
}
