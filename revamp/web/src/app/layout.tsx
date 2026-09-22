import type { Metadata } from "next";
import { Archivo, Hanken_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";
import "./landing-template.css";

const heading = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});
const sans = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = Space_Mono({ variable: "--font-space", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://anugrahplastik.com"),
  title: "Cetak Plastik Custom Tanpa Minimum Order | Anugrah Plastik Bandung",
  description:
    "Buat ulang spare part dan produk plastik custom dari sampel atau gambar. Free moulding tanpa syarat, tanpa minimum order.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${heading.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
