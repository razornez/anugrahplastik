import Image from "next/image";
import Link from "next/link";
import type { SeoPage } from "@/features/marketing/seo-pages";

export function SeoServicePage({ page }: { page: SeoPage }) {
  const path = page.kind === "product" ? `produk/${page.slug}` : page.slug;
  const url = `https://anugrahplastik.com/${path}`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": page.kind === "product" ? "Product" : "Service",
        name: page.heading,
        description: page.description,
        image: `https://anugrahplastik.com${page.image}`,
        url,
        provider: { "@type": "LocalBusiness", name: "CV. Anugrahplastik Mandiri Bandung" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Beranda", item: "https://anugrahplastik.com/" },
          { "@type": "ListItem", position: 2, name: page.heading, item: url },
        ],
      },
    ],
  };
  return (
    <main className="ap-seo-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <nav aria-label="Breadcrumb">
        <Link href="/">Beranda</Link>
        <span>/</span>
        <span>{page.eyebrow}</span>
      </nav>
      <section className="ap-seo-hero">
        <div>
          <p>{page.eyebrow}</p>
          <h1>{page.heading}</h1>
          <p className="ap-seo-intro">{page.intro}</p>
          <Link className="ap-seo-cta" href="/#ap-contact">
            Minta penawaran
          </Link>
        </div>
        <Image src={page.image} alt={page.imageAlt} width={1200} height={936} sizes="(max-width: 700px) 100vw, 45vw" />
      </section>
      <section className="ap-seo-details" aria-label="Informasi layanan">
        <h2>Mulai dari kebutuhan yang jelas.</h2>
        <ul>
          {page.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
