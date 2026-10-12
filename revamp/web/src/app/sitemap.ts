import type { MetadataRoute } from "next";
import { getLandingPublishedAt } from "@/features/content/landing-service";
import { seoPages } from "@/features/marketing/seo-pages";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = await getLandingPublishedAt();
  const serviceUrls = seoPages.map((page) => ({
    url: `https://anugrahplastik.com/${page.kind === "product" ? "produk/" : ""}${page.slug}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: page.kind === "product" ? 0.9 : 0.8,
  }));

  return [
    { url: "https://anugrahplastik.com/", lastModified, changeFrequency: "weekly", priority: 1 },
    ...serviceUrls,
    { url: "https://anugrahplastik.com/privasi", lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: "https://anugrahplastik.com/syarat-penggunaan", lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
