import type { Metadata } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = DM_Mono({ variable: "--font-mono", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  metadataBase: new URL("https://anugrahplastik.com"),
  title: "Cetak Plastik Custom Tanpa Minimum Order | Anugrah Plastik Bandung",
  description:
    "Buat ulang spare part dan produk plastik custom dari sampel atau gambar. Free moulding tanpa syarat, tanpa minimum order.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
