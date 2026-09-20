import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing-page";
import { getSession } from "@/lib/auth/session";
import { getDraftLandingContent } from "@/features/content/landing-service";

export const instant = false;

export default async function LandingPreviewPage() {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "content")) redirect("/admin/login");

  const content = await getDraftLandingContent();
  return <LandingPage content={content} />;
}
