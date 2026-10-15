import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/wght.css";
import "@fontsource-variable/hanken-grotesk/wght.css";
import "@fontsource/space-mono/latin-400.css";
import "@fontsource/space-mono/latin-700.css";
import { SITE_ORIGIN, socialMetadata } from "@/features/marketing/site-metadata";
import "./globals.css";
import "./landing-template.css";

const defaultTitle = "Cetak Plastik Custom Tanpa Minimum Order | Anugrah Plastik Bandung";
const defaultDescription =
  "Buat ulang spare part dan produk plastik custom dari sampel atau gambar. Free moulding tanpa syarat, tanpa minimum order.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: defaultTitle,
  description: defaultDescription,
  verification: {
    google: "nduf5IZf3GkeWsVFQGLWPxKUJ3cibs3NyaKOr4SDb3k",
  },
  ...socialMetadata({ title: defaultTitle, description: defaultDescription }),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/anugrah-plastik-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/anugrah-plastik-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/anugrah-plastik-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#0b2442", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="id">
      <body>{children}</body>
    </html>
  );
}
