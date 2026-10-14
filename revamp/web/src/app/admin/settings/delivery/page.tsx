import { redirect } from "next/navigation";

export default function LegacyDeliverySettingsPage() {
  redirect("/admin/settings/documents?section=numbers&kind=delivery#numbers");
}
