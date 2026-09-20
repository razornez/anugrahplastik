import Image from "next/image";
import Link from "next/link";
import type { LandingContent } from "@/features/content/landing-content";
import { LeadForm } from "./lead-form";

const benefits = [
  ["Bahan berkualitas", "Material dipilih sesuai fungsi part agar tahan lama dan konsisten."],
  ["Custom sesuai sampel", "Kirim contoh barang atau gambar; kami bantu baca kebutuhan bentuknya."],
  ["Produksi in-house", "Molding, cetak, dan pengecekan dikerjakan dalam satu workshop."],
  ["Legal dan jelas", "Usaha terdaftar resmi untuk proses kerja yang lebih tenang."],
  ["Tanpa minimum order", "Mulai dari kebutuhan eceran sampai produksi yang lebih besar."],
];

const steps = [
  ["01", "Kirim sampel", "Sampel, foto, gambar, atau masalah part yang ingin diselesaikan."],
  ["02", "Pilih bahan", "Kami bantu memilih bahan berdasarkan fungsi dan kondisi pakai."],
  ["03", "Molding dan produksi", "Molding dikerjakan tanpa biaya lalu produksi dimulai setelah siap."],
  ["04", "Periksa dan kirim", "Part diperiksa, dikemas, lalu dikirim ke lokasi Anda."],
];

const materials = ["HD", "LD", "PVC", "PP", "Nilon", "PS", "Acrylic", "Spon", "Karet"];

const portfolio = [
  ["produk", "Rangka grid custom", "Produk Custom", "/images-webp/new/PRODUK 1 [RESIZE].webp"],
  ["produk", "Wadah emboss logo", "Produk Custom", "/images-webp/new/PRODUK 2 [RESIZE].webp"],
  ["produk", "Ring tutup PP", "Produk Custom", "/images-webp/new/PRODUK 5 [RESIZE].webp"],
  ["produk", "Tabung PP transparan", "Produk Custom", "/images-webp/new/PRODUK 7 [RESIZE].webp"],
  ["sparepart", "Flange ring", "Sparepart", "/images-webp/new/PRODUK 16 [RESIZE].webp"],
  ["sparepart", "Gear nilon", "Sparepart", "/images-webp/portfolio/gear.webp"],
  ["klien", "Project Surya Pro", "Klien", "/images-webp/portfolio/surya_pro_1.webp"],
  ["mesin", "CNC milling molding", "Workshop", "/images-webp/mesin/Anugrah Plastik (105).webp"],
] as const;

const faqs = [
  [
    "Apakah free moulding benar tanpa syarat?",
    "Ya. Pembuatan molding tidak dibebankan sebagai biaya terpisah untuk kebutuhan yang kami proses bersama.",
  ],
  [
    "Apakah ada minimal order?",
    "Tidak ada minimum order. Ceritakan kebutuhan Anda, lalu kami bantu arahkan proses yang paling masuk akal.",
  ],
  [
    "Apa bedanya dengan printer 3D?",
    "Cetak plastik lebih cocok saat part perlu material, kekuatan, finishing, atau hasil yang konsisten untuk dipakai berulang.",
  ],
  [
    "Apa yang perlu dikirim untuk minta penawaran?",
    "Sampel adalah yang terbaik. Foto, ukuran, gambar, atau penjelasan fungsi part juga dapat menjadi awal evaluasi.",
  ],
  [
    "Apakah melayani luar Bandung?",
    "Ya. Kami melayani pengiriman ke luar kota setelah part selesai diperiksa dan dikemas.",
  ],
];

export function LandingPage({ content }: { content: LandingContent }) {
  return (
    <main className="ap-page">
      <div className="ap-topbar">
        <div className="ap-wrap">
          {content.topbar.promise}
          <span>Bandung · Indonesia</span>
        </div>
      </div>
      <header className="ap-header">
        <div className="ap-wrap ap-header-inner">
          <Link href="#hero" className="ap-brand">
            <b>AP</b>
            <span>
              ANUGRAH PLASTIK<small>Cetak plastik · Bandung</small>
            </span>
          </Link>
          <nav>
            {["Tentang", "Keunggulan", "Proses", "Material", "Portofolio", "Kontak"].map((item) => (
              <a key={item} href={`#${item === "Portofolio" ? "portfolio" : item.toLowerCase()}`}>
                {item}
              </a>
            ))}
          </nav>
          <a className="ap-wa ap-header-cta" href="#contact">
            Hubungi Kami
          </a>
        </div>
      </header>

      <section id="hero" className="ap-hero">
        <div className="ap-wrap ap-hero-grid">
          <div>
            <p className="ap-kicker">CV. ANUGRAHPLASTIK MANDIRI BANDUNG</p>
            <h1>
              {content.hero.titleBefore}
              <br />
              <em>{content.hero.titleHighlight}</em>
              <br />
              {content.hero.titleAfter}
            </h1>
            <p className="ap-lede">{content.hero.description}</p>
            <div className="ap-actions">
              <a className="ap-wa" href="#contact">
                {content.hero.primaryCta}
              </a>
              <a className="ap-ghost" href="#portfolio">
                {content.hero.secondaryCta}
              </a>
            </div>
            <p className="ap-micro">HD · PVC · PP · Nilon · Acrylic · dan lainnya</p>
          </div>
          <div className="ap-hero-photo">
            <Image
              src="/images-webp/mesin/Anugrah Plastik (105).webp"
              alt="Mesin CNC milling di workshop Anugrah Plastik"
              fill
              priority
              sizes="(max-width: 900px) 100vw, 50vw"
            />
            <span>WORKSHOP · ARJASARI, BANDUNG</span>
            <strong>
              15+<small>jenis bahan plastik</small>
            </strong>
          </div>
        </div>
      </section>
      <div className="ap-marquee">PLASTIK HD · PVC & PP · NILON & PS · ACRYLIC · SPAREPART MESIN · MOLDING CUSTOM</div>

      <section id="tentang" className="ap-section">
        <div className="ap-wrap ap-about">
          <Image
            src="/images-webp/new/PRODUK 1 [RESIZE].webp"
            alt="Contoh hasil cetak plastik custom"
            width={620}
            height={520}
          />
          <div>
            <p className="ap-kicker">TENTANG KAMI</p>
            <h2>{content.about.title}</h2>
            <p>{content.about.body}</p>
            <div className="ap-stats">
              <b>
                2020<small>terdaftar resmi</small>
              </b>
              <b>
                2<small>teknik produksi</small>
              </b>
              <b>
                Nego<small>partai dan eceran</small>
              </b>
            </div>
          </div>
        </div>
      </section>
      <section id="keunggulan" className="ap-section ap-pale">
        <div className="ap-wrap">
          <p className="ap-kicker">ALASAN MEMILIH KAMI</p>
          <h2>{content.why.title}</h2>
          <div className="ap-benefits">
            {benefits.map(([title, body], index) => (
              <article key={title}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
            <article className="ap-dark-card">
              <h3>Punya sampel?</h3>
              <p>Kirim foto atau contoh barang untuk mulai evaluasi.</p>
              <a href="#contact">Konsultasi gratis →</a>
            </article>
          </div>
        </div>
      </section>
      <section id="proses" className="ap-section">
        <div className="ap-wrap ap-center">
          <p className="ap-kicker">PROSES PENGERJAAN</p>
          <h2>{content.process.title}</h2>
          <div className="ap-steps">
            {steps.map(([number, title, body]) => (
              <article key={number}>
                <b>{number}</b>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section id="material" className="ap-material">
        <div className="ap-wrap ap-material-grid">
          <div>
            <p className="ap-kicker">MATERIAL & APLIKASI</p>
            <h2>{content.material.title}</h2>
            <p>Setiap part memiliki kebutuhan berbeda. Kami bantu memilih bahan yang tepat sebelum produksi dimulai.</p>
            <a href="#contact">{content.material.primaryCta}</a>
          </div>
          <div className="ap-materials">
            {materials.map((item) => (
              <span key={item}>
                {item}
                <small>material</small>
              </span>
            ))}
          </div>
        </div>
      </section>
      <PortfolioSection content={content} />
      <section className="ap-trust ap-section">
        <div className="ap-wrap ap-center">
          <p className="ap-kicker">KLIEN & MITRA</p>
          <h2>Dipercaya oleh klien lintas industri</h2>
          <p>Dari industri tekstil dan otomotif sampai produk kemasan serta pertanian.</p>
          <div>
            {["SURYA PRO", "NUSANTARA TEKSTIL", "MITRA DIESEL", "PRIMA KEMAS", "TIRTA AGRO", "POLIMER WORKS"].map(
              (client) => (
                <span key={client}>{client}</span>
              ),
            )}
          </div>
        </div>
      </section>
      <section className="ap-section" id="faq">
        <div className="ap-wrap ap-faq">
          <div className="ap-faq-intro">
            <p className="ap-kicker">FAQ</p>
            <h2>{content.faq.title}</h2>
            <p>{content.faq.description}</p>
            <a className="ap-wa" href="#contact">
              {content.faq.primaryCta}
            </a>
          </div>
          <div>
            {faqs.map(([question, answer], index) => (
              <details key={question}>
                <summary>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  {question}
                  <span>+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section id="contact" className="ap-contact">
        <div className="ap-wrap">
          <div className="ap-center">
            <p className="ap-kicker">KONTAK & PEMESANAN</p>
            <h2>{content.contact.title}</h2>
            <p>{content.contact.description}</p>
          </div>
          <div className="ap-contact-grid">
            <div className="ap-form-box">
              <h3>{content.contact.formTitle}</h3>
              <p>{content.contact.formDescription}</p>
              <LeadForm />
            </div>
            <div className="ap-contact-info">
              <a href="https://wa.me/628122339587">
                WHATSAPP
                <br />
                <b>0812-2339587</b>
              </a>
              <a href="mailto:cs@anugrahplastik.com">
                EMAIL
                <br />
                <b>cs@anugrahplastik.com</b>
              </a>
              <p>
                ALAMAT WORKSHOP
                <br />
                <b>Komp. Lebak Wangi Asri, Arjasari, Kab. Bandung 40379</b>
              </p>
            </div>
          </div>
        </div>
      </section>
      <footer className="ap-footer">
        <div className="ap-wrap">
          <div className="ap-brand">
            <b>AP</b>
            <span>ANUGRAH PLASTIK</span>
          </div>
          <p>{content.footer.description}</p>
          <small>© 2026 CV. Anugrahplastik Mandiri Bandung</small>
        </div>
      </footer>
    </main>
  );
}

function PortfolioSection({ content }: { content: LandingContent }) {
  return (
    <section id="portfolio" className="ap-section">
      <div className="ap-wrap">
        <p className="ap-kicker">PORTOFOLIO</p>
        <h2>{content.portfolio.title}</h2>
        <div className="ap-portfolio">
          {portfolio.map(([category, title, label, image]) => (
            <article key={title}>
              <Image src={image} alt={title} width={420} height={340} sizes="(max-width: 600px) 50vw, 25vw" />
              <p>{label}</p>
              <h3>{title}</h3>
              <span>{category}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
