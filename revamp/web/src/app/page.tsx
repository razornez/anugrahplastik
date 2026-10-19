import type { Metadata } from "next";
import { connection } from "next/server";
import { NativeLandingTemplate } from "@/components/native-landing-template";
import { LandingStructuredData } from "@/components/landing-structured-data";
import { getPublishedLandingContent } from "@/features/content/landing-service";
import { socialMetadata } from "@/features/marketing/site-metadata";

// Halaman boleh menunggu koneksi request demi membaca konten yang sudah
// diterbitkan; tanpa ini Cache Components mencoba memprarendernya saat build.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublishedLandingContent();
  return {
    title: content.metadata.title,
    description: content.metadata.description,
    alternates: { canonical: "/" },
    ...socialMetadata({ title: content.metadata.title, description: content.metadata.description }),
  };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ ap_variant?: string }> }) {
  // Konten halaman utama diterbitkan dari back office. Menunggu request
  // menghindari HTML publik yang dibekukan saat build, tanpa menonaktifkan
  // Cache Components untuk seluruh aplikasi.
  await connection();
  const content = await getPublishedLandingContent();
  // Explicit preview URLs only. Normal visits and current ad links remain the control layout.
  const variant = (await searchParams).ap_variant === "proof" ? "proof" : "control";
  return (
    <>
      <LandingStructuredData content={content} />
      <NativeLandingTemplate content={content} variant={variant} />
    </>
  );
}
