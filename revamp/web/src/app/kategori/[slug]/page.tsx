import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPublishedLandingContent } from "@/features/content/landing-service";

// This page resolves current published gallery content at request time.
export const instant = false;

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const [{ slug }, content] = await Promise.all([params, getPublishedLandingContent()]);
  const category = content.galleryCategories.find((item) => item.slug === slug && item.isPublished);
  if (!category) notFound();
  return (
    <main className="category-detail">
      <Link href="/">← Kembali ke halaman utama</Link>
      <Image alt={category.altText} height={640} priority src={category.imagePath} width={960} />
      <p>KATEGORI PRODUK</p>
      <h1>{category.title}</h1>
      <h2>Produk terkait</h2>
      <ul>
        {category.products.map((product) => (
          <li key={product}>{product}</li>
        ))}
      </ul>
      <Link className="category-detail__cta" href="/#ap-contact">
        Konsultasikan kebutuhan Anda
      </Link>
    </main>
  );
}
