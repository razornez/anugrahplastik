import { redirect } from "next/navigation";

export default function LegacyHandoverSettingsPage() {
  redirect("/admin/settings/documents?section=numbers&kind=handover#numbers");
}
