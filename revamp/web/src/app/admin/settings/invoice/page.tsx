import { redirect } from "next/navigation";

export default function LegacyInvoiceSettingsPage() {
  redirect("/admin/settings/documents?section=identity#identity");
}
