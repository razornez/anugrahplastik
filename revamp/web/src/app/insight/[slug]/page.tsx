import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPublishedLandingContent } from "@/features/content/landing-service";

// This page resolves current published editorial content at request time.
export const instant = false;

export default async function InsightPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const [{ slug }, content] = await Promise.all([params, getPublishedLandingContent()]);
  const insight = content.featuredInsights.find((item) => item.slug === slug && item.isPublished);
  if (!insight) notFound();
  return (
    <main className="category-detail">
      <Link href="/">← Kembali ke halaman utama</Link>
      <p>{insight.category}</p>
      <h1>{insight.title}</h1>
      <p>{insight.excerpt}</p>
      <Link className="category-detail__cta" href="/#ap-contact">
        Diskusikan kebutuhan Anda
      </Link>
    </main>
  );
}
