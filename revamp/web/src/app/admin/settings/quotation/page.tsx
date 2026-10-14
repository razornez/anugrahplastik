import { redirect } from "next/navigation";

export default function LegacyQuotationSettingsPage() {
  redirect("/admin/settings/documents?section=numbers&kind=quotation#numbers");
}
