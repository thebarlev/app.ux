import { redirect } from "next/navigation";

export default function RedirectToReceipt() {
  redirect("/dashboard/incomes/documents/new/receipt");
}
