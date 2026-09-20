import Image from "next/image";
import { LeadForm } from "@/components/lead-form";

const portfolio = [
  {
    category: "Komponen mesin",
    title: "Gear plastik untuk part pengganti",
    material: "Nilon / HD",
    image: "/images/img/portfolio/gear.jpg",
  },
  {
    category: "Produk custom",
    title: "Rangka grid sesuai fungsi produk",
    material: "Material sesuai kebutuhan",
    image: "/images/img/new/PRODUK%201%20%5BRESIZE%5D.jpg",
  },
  {
    category: "Kemasan & komponen",
    title: "Part plastik produksi berulang",
    material: "PP / PVC",
    image: "/images/img/new/PRODUK%205%20%5BRESIZE%5D.jpg",
  },
];

const questions = [
  [
    "Apa beda injection, manual, dan 3D printing?",
    "3D printing cocok untuk purwarupa cepat. Cetak manual dan injection dipilih ketika fungsi, bahan, atau pengulangan produksi membutuhkan hasil yang lebih sesuai. Kirim kebutuhan Anda, kami bantu arahkan prosesnya.",
  ],
  [
    "Apakah ada minimum order?",
    "Tidak. Kami melayani kebutuhan satuan maupun produksi berulang. Jumlah dan proses akan dibahas berdasarkan bentuk part, material, serta fungsi pemakaian.",
  ],
  [
    "Bagaimana cara meminta penawaran?",
    "Kirim foto, gambar, atau sampel part. Tim kami akan mempelajari kebutuhan dan menghubungi Anda untuk langkah berikutnya.",
  ],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <div className="shell header-shell">
          <a className="brand" href="#beranda" aria-label="Anugrah Plastik beranda">
            <span className="mark">AP</span>
            <span>
              <strong>Anugrah Plastik</strong>
              <small>Cetak plastik · Bandung</small>
            </span>
          </a>
          <nav className="desktop-nav" aria-label="Navigasi utama">
            <a href="#layanan">Layanan</a>
            <a href="#cara-kerja">Cara kerja</a>
            <a href="#portfolio">Portfolio</a>
            <a href="#faq">Panduan</a>
          </nav>
          <a className="header-cta" href="#konsultasi">
            Kirim sampel
          </a>
          <details className="mobile-nav">
            <summary aria-label="Buka menu">Menu</summary>
            <nav aria-label="Navigasi mobile">
              <a href="#layanan">Layanan</a>
              <a href="#cara-kerja">Cara kerja</a>
              <a href="#portfolio">Portfolio</a>
              <a href="#faq">Panduan</a>
              <a className="mobile-nav-cta" href="#konsultasi">
                Kirim sampel
              </a>
            </nav>
          </details>
        </div>
      </header>

      <section className="hero" id="beranda">
        <div className="shell hero-shell">
          <div className="hero-copy">
            <p className="eyebrow">
              <i /> Free moulding · tanpa minimum order
            </p>
            <h1>Punya sampel part plastik? Kami bantu jadikan siap produksi.</h1>
            <p className="lede">
              Mulai dari part pengganti mesin sampai produk custom. Kirim sampel atau gambar, lalu kami bantu memilih
              proses dan material yang sesuai.
            </p>
            <div className="actions">
              <a className="button primary" href="#konsultasi">
                Minta estimasi produksi <span>→</span>
              </a>
              <a className="button secondary" href="#proses">
                Bandingkan proses
              </a>
            </div>
            <ul className="trust">
              <li>Konsultasi awal</li>
              <li>Pilihan material</li>
              <li>Repetisi order mudah</li>
            </ul>
          </div>
          <div className="hero-visual">
            <Image
              src="/images/img/mesin/Anugrah%20Plastik%20(105).jpg"
              alt="Mesin workshop Anugrah Plastik"
              fill
              priority
              sizes="(max-width: 899px) 100vw, 46vw"
            />
            <div className="shade" />
            <p className="visual-top">
              Sample <span>→</span> evaluasi <span>→</span> produksi
            </p>
            <p className="visual-bottom">
              <b>15+</b>
              <span>
                jenis material
                <br />
                untuk dipertimbangkan
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className="section shell" id="layanan">
        <div className="heading center">
          <p className="eyebrow">
            <i /> Mulai dari kondisi Anda
          </p>
          <h2>Bagaimana kami bisa membantu?</h2>
          <p>Tidak perlu sudah tahu proses produksinya. Pilih titik awal yang paling dekat dengan kondisi Anda.</p>
        </div>
        <div className="intent-grid">
          <a className="intent" href="#konsultasi">
            <span>01</span>
            <h3>Saya punya sampel atau part</h3>
            <p>Butuh dibuat ulang, dicari materialnya, atau diperbaiki fungsi partnya.</p>
            <b>Kirim sampel →</b>
          </a>
          <a className="intent" href="#konsultasi">
            <span>02</span>
            <h3>Saya punya gambar atau desain</h3>
            <p>Diskusikan kelayakan bentuk, material, dan cara produksi sebelum mulai.</p>
            <b>Kirim gambar →</b>
          </a>
          <a className="intent" href="#konsultasi">
            <span>03</span>
            <h3>Saya baru punya ide produk</h3>
            <p>Mulai dari kebutuhan fungsi sampai contoh hasil yang bisa dievaluasi bersama.</p>
            <b>Ceritakan ide →</b>
          </a>
        </div>
      </section>

      <section className="process" id="proses">
        <div className="shell process-shell">
          <div className="heading inverse">
            <p className="eyebrow">
              <i /> Panduan singkat
            </p>
            <h2>Proses yang tepat dimulai dari kebutuhan, bukan tebakan.</h2>
            <p>Setiap part punya pertimbangan bahan, kekuatan, detail bentuk, dan jumlah produksi yang berbeda.</p>
            <a href="#faq">Pelajari sebelum membuat keputusan →</a>
          </div>
          <ol id="cara-kerja">
            <li>
              <b>01</b>
              <span>Kirimi kami sampel, foto, atau gambar.</span>
            </li>
            <li>
              <b>02</b>
              <span>Kami evaluasi fungsi, material, dan proses.</span>
            </li>
            <li>
              <b>03</b>
              <span>Produksi dimulai setelah arah pengerjaan disepakati.</span>
            </li>
          </ol>
        </div>
      </section>

      <section className="section shell" id="portfolio">
        <div className="heading row">
          <div>
            <p className="eyebrow">
              <i /> Hasil produksi
            </p>
            <h2>Dari masalah nyata ke part yang siap dipakai.</h2>
          </div>
          <a className="button secondary" href="#konsultasi">
            Diskusikan kebutuhan Anda
          </a>
        </div>
        <div className="portfolio-grid">
          {portfolio.map((item) => (
            <article className="portfolio-card" key={item.title}>
              <div className="portfolio-image">
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  sizes="(max-width: 699px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <div>
                <p>{item.category}</p>
                <h3>{item.title}</h3>
                <span>{item.material}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="faq" id="faq">
        <div className="shell faq-shell">
          <div className="heading faq-intro">
            <p className="eyebrow">
              <i /> Yang sering ditanyakan
            </p>
            <h2>Hal yang perlu jelas sebelum mulai cetak plastik.</h2>
            <p>Jika masih ragu, kirim kondisi part Anda. Kami bantu mengarahkan pembahasannya.</p>
          </div>
          <div className="faq-list">
            {questions.map(([question, answer], index) => (
              <details className="faq-item" key={question} open={index === 0}>
                <summary>
                  <span>0{index + 1}</span>
                  {question}
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="contact" id="konsultasi">
        <div className="shell contact-shell">
          <div className="heading">
            <p className="eyebrow">
              <i /> Mulai percakapan
            </p>
            <h2>Punya sampel, gambar, atau ide produk?</h2>
            <p>Berikan kontak dan kebutuhan singkat Anda. Tim kami akan melanjutkan pembahasan melalui WhatsApp.</p>
          </div>
          <LeadForm />
        </div>
      </section>

      <footer className="footer">
        <div className="shell footer-shell">
          <div>
            <span className="mark">AP</span>
            <strong>Anugrah Plastik</strong>
          </div>
          <p>Custom plastic manufacturing · Bandung</p>
          <a href="#beranda">Kembali ke atas ↑</a>
        </div>
      </footer>
    </main>
  );
}
