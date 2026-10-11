import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function GrowthOpportunitiesPage() {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  redirect("/admin/growth?radar=marketing#peluang");
}
