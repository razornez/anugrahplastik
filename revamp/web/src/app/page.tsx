import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page";
import { getPublishedLandingContent } from "@/features/content/landing-service";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublishedLandingContent();
  return {
    title: content.metadata.title,
    description: content.metadata.description,
    alternates: { canonical: "/" },
    openGraph: { title: content.metadata.title, description: content.metadata.description, type: "website" },
  };
}

export default async function Home() {
  const content = await getPublishedLandingContent();
  return <LandingPage content={content} />;
}
