import type { Metadata } from "next";
import { NativeLandingTemplate } from "@/components/native-landing-template";
import { LandingStructuredData } from "@/components/landing-structured-data";
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
  return (
    <>
      <LandingStructuredData content={content} />
      <NativeLandingTemplate content={content} />
    </>
  );
}
