import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: "https://anugrahplastik.com/", lastModified, changeFrequency: "weekly", priority: 1 },
    { url: "https://anugrahplastik.com/privasi", lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: "https://anugrahplastik.com/syarat-penggunaan", lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
