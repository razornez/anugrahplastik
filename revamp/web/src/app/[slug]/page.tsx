import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoServicePage } from "@/components/seo-service-page";
import { findSeoPage, seoPages } from "@/features/marketing/seo-pages";
export function generateStaticParams() {
  return seoPages.filter((page) => page.kind === "service").map(({ slug }) => ({ slug }));
}
export function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return params.then(({ slug }) => {
    const page = findSeoPage(slug, "service");
    return page ? { title: page.title, description: page.description, alternates: { canonical: `/${page.slug}` } } : {};
  });
}
export default async function ServiceRoute({ params }: { params: Promise<{ slug: string }> }) {
  const page = findSeoPage((await params).slug, "service");
  if (!page) notFound();
  return <SeoServicePage page={page} />;
}
