import type { LandingContent } from "@/features/content/landing-content";

export function LandingStructuredData({ content }: { content: LandingContent }) {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        name: "CV. Anugrahplastik Mandiri Bandung",
        url: "https://anugrahplastik.com/",
        telephone: "+628122339587",
        email: "cs@anugrahplastik.com",
        description: content.metadata.description,
        image: "https://anugrahplastik.com/images-webp/mesin/Anugrah%20Plastik%20%28105%29.webp",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Komp. Lebak Wangi Asri Blok A2 No.16 Rt 05/13, Ds. Lebak Wangi, Kec. Arjasari",
          addressLocality: "Kabupaten Bandung",
          addressRegion: "Jawa Barat",
          postalCode: "40379",
          addressCountry: "ID",
        },
        areaServed: "Indonesia",
      },
      { "@type": "WebSite", name: "Anugrah Plastik", url: "https://anugrahplastik.com/" },
    ],
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}
