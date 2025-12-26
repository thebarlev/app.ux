import { redirect } from "next/navigation";

export default function RedirectToReceipt() {
  redirect("/dashboard/documents/receipt");
}
