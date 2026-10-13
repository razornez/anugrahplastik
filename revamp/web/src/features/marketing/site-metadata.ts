import type { Metadata } from "next";

export const SITE_ORIGIN = "https://anugrahplastik.com";
export const SOCIAL_IMAGE_PATH = "/brand/anugrah-plastik-social-logo-v1.png";

const SOCIAL_IMAGE = {
  url: SOCIAL_IMAGE_PATH,
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Logo resmi Anugrah Plastik",
} as const;

export function socialMetadata({
  title,
  description,
  url = "/",
}: {
  title: string;
  description: string;
  url?: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      title,
      description,
      url,
      siteName: "Anugrah Plastik",
      locale: "id_ID",
      type: "website",
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: SOCIAL_IMAGE.url, alt: SOCIAL_IMAGE.alt }],
    },
  };
}
