"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { LandingContent } from "@/features/content/landing-content";

type SectionId =
  "seo" | "topbar" | "hero" | "about" | "why" | "process" | "material" | "portfolio" | "faq" | "contact" | "footer";

type FieldBinding = {
  name: string;
  label: string;
  multiline?: boolean;
  get: (content: LandingContent) => string;
  set: (content: LandingContent, value: string) => LandingContent;
};

type SectionDefinition = {
  id: SectionId;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  fields: FieldBinding[];
};

function field(
  name: string,
  label: string,
  get: FieldBinding["get"],
  set: FieldBinding["set"],
  multiline = false,
): FieldBinding {
  return { name, label, get, set, multiline };
}

const sections: SectionDefinition[] = [
  {
    id: "seo",
    label: "SEO",
    eyebrow: "Penelusuran",
    title: "Judul dan deskripsi pencarian",
    description: "Teks ini tampil di hasil pencarian dan saat tautan halaman dibagikan.",
    fields: [
      field(
        "metadata.title",
        "Judul halaman",
        (c) => c.metadata.title,
        (c, v) => ({ ...c, metadata: { ...c.metadata, title: v } }),
      ),
      field(
        "metadata.description",
        "Deskripsi pencarian",
        (c) => c.metadata.description,
        (c, v) => ({ ...c, metadata: { ...c.metadata, description: v } }),
        true,
      ),
    ],
  },
  {
    id: "topbar",
    label: "Bar atas",
    eyebrow: "Pembuka",
    title: "Pesan singkat di paling atas",
    description: "Gunakan satu janji yang paling cepat dipahami calon customer.",
    fields: [
      field(
        "topbar.promise",
        "Pesan singkat",
        (c) => c.topbar.promise,
        (c, v) => ({ ...c, topbar: { promise: v } }),
      ),
    ],
  },
  {
    id: "hero",
    label: "Hero",
    eyebrow: "Bagian pertama",
    title: "Ajakan utama di awal halaman",
    description: "Buat calon customer segera memahami masalah yang dapat kita bantu selesaikan.",
    fields: [
      field(
        "hero.titleBefore",
        "Judul baris 1",
        (c) => c.hero.titleBefore,
        (c, v) => ({ ...c, hero: { ...c.hero, titleBefore: v } }),
      ),
      field(
        "hero.titleHighlight",
        "Judul sorotan",
        (c) => c.hero.titleHighlight,
        (c, v) => ({ ...c, hero: { ...c.hero, titleHighlight: v } }),
      ),
      field(
        "hero.titleAfter",
        "Judul baris 3",
        (c) => c.hero.titleAfter,
        (c, v) => ({ ...c, hero: { ...c.hero, titleAfter: v } }),
      ),
      field(
        "hero.description",
        "Deskripsi",
        (c) => c.hero.description,
        (c, v) => ({ ...c, hero: { ...c.hero, description: v } }),
        true,
      ),
      field(
        "hero.primaryCta",
        "Teks tombol utama",
        (c) => c.hero.primaryCta,
        (c, v) => ({ ...c, hero: { ...c.hero, primaryCta: v } }),
      ),
      field(
        "hero.secondaryCta",
        "Teks tombol kedua",
        (c) => c.hero.secondaryCta,
        (c, v) => ({ ...c, hero: { ...c.hero, secondaryCta: v } }),
      ),
    ],
  },
  {
    id: "about",
    label: "Profil",
    eyebrow: "Pengenalan",
    title: "Penjelasan singkat tentang layanan",
    description: "Tampilkan cara kerja dan jenis kebutuhan yang kita bantu.",
    fields: [
      field(
        "about.title",
        "Judul",
        (c) => c.about.title,
        (c, v) => ({ ...c, about: { ...c.about, title: v } }),
      ),
      field(
        "about.body",
        "Deskripsi",
        (c) => c.about.body,
        (c, v) => ({ ...c, about: { ...c.about, body: v } }),
        true,
      ),
    ],
  },
  {
    id: "why",
    label: "Keunggulan",
    eyebrow: "Alasan memilih",
    title: "Judul alasan customer memilih",
    description: "Kartu keunggulan yang berada setelah profil.",
    fields: [
      field(
        "why.title",
        "Judul",
        (c) => c.why.title,
        (c, v) => ({ ...c, why: { title: v } }),
      ),
    ],
  },
  {
    id: "process",
    label: "Proses",
    eyebrow: "Alur kerja",
    title: "Judul tahapan pengerjaan",
    description: "Membantu customer memahami langkah dari sampel sampai barang diterima.",
    fields: [
      field(
        "process.title",
        "Judul",
        (c) => c.process.title,
        (c, v) => ({ ...c, process: { title: v } }),
      ),
    ],
  },
  {
    id: "material",
    label: "Material",
    eyebrow: "Pilihan bahan",
    title: "Pesan tentang pilihan material",
    description: "Bagian berlatar gelap yang mengarahkan customer untuk berkonsultasi.",
    fields: [
      field(
        "material.title",
        "Judul",
        (c) => c.material.title,
        (c, v) => ({ ...c, material: { ...c.material, title: v } }),
      ),
      field(
        "material.primaryCta",
        "Teks tombol",
        (c) => c.material.primaryCta,
        (c, v) => ({ ...c, material: { ...c.material, primaryCta: v } }),
      ),
    ],
  },
  {
    id: "portfolio",
    label: "Portfolio",
    eyebrow: "Hasil produksi",
    title: "Judul kumpulan hasil kerja",
    description: "Judul di atas kumpulan foto hasil produksi yang dapat ditata pada tahap berikutnya.",
    fields: [
      field(
        "portfolio.title",
        "Judul",
        (c) => c.portfolio.title,
        (c, v) => ({ ...c, portfolio: { title: v } }),
      ),
    ],
  },
  {
    id: "faq",
    label: "FAQ",
    eyebrow: "Pertanyaan umum",
    title: "Pertanyaan sebelum customer mulai",
    description: "Letak judul, penjelasan, dan ajakan terakhir pada bagian FAQ.",
    fields: [
      field(
        "faq.title",
        "Judul",
        (c) => c.faq.title,
        (c, v) => ({ ...c, faq: { ...c.faq, title: v } }),
      ),
      field(
        "faq.description",
        "Deskripsi",
        (c) => c.faq.description,
        (c, v) => ({ ...c, faq: { ...c.faq, description: v } }),
        true,
      ),
      field(
        "faq.primaryCta",
        "Teks tombol",
        (c) => c.faq.primaryCta,
        (c, v) => ({ ...c, faq: { ...c.faq, primaryCta: v } }),
      ),
    ],
  },
  {
    id: "contact",
    label: "Kontak",
    eyebrow: "Penutup utama",
    title: "Ajakan menghubungi tim",
    description: "Bagian formulir dan ajakan untuk memulai evaluasi kebutuhan.",
    fields: [
      field(
        "contact.title",
        "Judul",
        (c) => c.contact.title,
        (c, v) => ({ ...c, contact: { ...c.contact, title: v } }),
      ),
      field(
        "contact.description",
        "Deskripsi",
        (c) => c.contact.description,
        (c, v) => ({ ...c, contact: { ...c.contact, description: v } }),
        true,
      ),
      field(
        "contact.formTitle",
        "Judul formulir",
        (c) => c.contact.formTitle,
        (c, v) => ({ ...c, contact: { ...c.contact, formTitle: v } }),
      ),
      field(
        "contact.formDescription",
        "Keterangan formulir",
        (c) => c.contact.formDescription,
        (c, v) => ({ ...c, contact: { ...c.contact, formDescription: v } }),
      ),
      field(
        "contact.primaryCta",
        "Teks tombol formulir",
        (c) => c.contact.primaryCta,
        (c, v) => ({ ...c, contact: { ...c.contact, primaryCta: v } }),
      ),
    ],
  },
  {
    id: "footer",
    label: "Footer",
    eyebrow: "Penutup halaman",
    title: "Keterangan perusahaan",
    description: "Teks singkat yang tampil di bagian paling bawah landing page.",
    fields: [
      field(
        "footer.description",
        "Deskripsi perusahaan",
        (c) => c.footer.description,
        (c, v) => ({ ...c, footer: { description: v } }),
        true,
      ),
    ],
  },
];

type Props = { action: (formData: FormData) => void | Promise<void>; content: LandingContent; message: string };

export function LandingContentEditor({ action, content, message }: Props) {
  const [draft, setDraft] = useState(content);
  const [activeSectionId, setActiveSectionId] = useState<SectionId>("hero");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const activeIndex = sections.findIndex((section) => section.id === activeSectionId);
  const activeSection = sections[activeIndex] ?? sections[0];
  const hasLocalChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(content), [content, draft]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasLocalChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasLocalChanges]);
  const selectSection = (id: SectionId) => {
    setActiveSectionId(id);
    setMobileView("edit");
  };
  const previous = () => selectSection(sections[Math.max(0, activeIndex - 1)].id);
  const next = () => selectSection(sections[Math.min(sections.length - 1, activeIndex + 1)].id);

  return (
    <form action={action} className={`landing-editor landing-editor--${mobileView}`}>
      <div className="landing-editor__mobile-controls" aria-label="Cara melihat editor">
        <div className="landing-editor__view-tabs" role="tablist" aria-label="Tampilan editor">
          <button aria-selected={mobileView === "edit"} onClick={() => setMobileView("edit")} role="tab" type="button">
            Edit
          </button>
          <button
            aria-selected={mobileView === "preview"}
            onClick={() => setMobileView("preview")}
            role="tab"
            type="button"
          >
            Preview
          </button>
        </div>
        <label>
          Bagian yang diedit
          <select onChange={(event) => selectSection(event.target.value as SectionId)} value={activeSectionId}>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <nav className="landing-editor__index" aria-label="Bagian halaman">
        <p>Bagian halaman</p>
        {sections.map((section, index) => (
          <button
            aria-current={section.id === activeSectionId ? "step" : undefined}
            className={section.id === activeSectionId ? "is-active" : undefined}
            key={section.id}
            onClick={() => selectSection(section.id)}
            type="button"
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {section.label}
          </button>
        ))}
      </nav>
      <section className="landing-editor__form" aria-labelledby={`section-${activeSection.id}`}>
        <div className="admin-status" role="status">
          {message}
        </div>
        <div className="landing-editor__section-head">
          <p className="eyebrow">{activeSection.eyebrow}</p>
          <h2 id={`section-${activeSection.id}`}>{activeSection.title}</h2>
          <p>{activeSection.description}</p>
        </div>
        <div className="landing-editor__fields">
          {activeSection.fields.map((item) => (
            <label key={item.name}>
              {item.label}
              {item.multiline ? (
                <textarea
                  name={item.name}
                  onChange={(event) => setDraft((current) => item.set(current, event.target.value))}
                  required
                  rows={5}
                  value={item.get(draft)}
                />
              ) : (
                <input
                  name={item.name}
                  onChange={(event) => setDraft((current) => item.set(current, event.target.value))}
                  required
                  value={item.get(draft)}
                />
              )}
            </label>
          ))}
        </div>
        <div className="landing-editor__step-actions">
          <button disabled={activeIndex === 0} onClick={previous} type="button">
            ← Sebelumnya
          </button>
          <span>
            {activeIndex + 1} dari {sections.length}
          </span>
          <button disabled={activeIndex === sections.length - 1} onClick={next} type="button">
            Berikutnya →
          </button>
        </div>
      </section>
      <aside className="landing-editor__preview" aria-label="Mini landing untuk melihat perubahan">
        <div className="landing-editor__preview-head">
          <div>
            <p className="eyebrow">Mini landing</p>
            <h2>Letak perubahan</h2>
          </div>
          <span className={hasLocalChanges ? "is-unsaved" : ""}>
            {hasLocalChanges ? "Belum disimpan" : "Tersimpan"}
          </span>
        </div>
        <p className="landing-editor__preview-note">Klik bagian mana pun untuk mulai mengubahnya.</p>
        <MiniLandingPreview activeSectionId={activeSectionId} content={draft} onSelect={selectSection} />
        <div className="landing-editor__publish">
          <a href="/preview/landing" rel="noreferrer" target="_blank">
            Buka landing penuh ↗
          </a>
          <button name="action" type="submit" value="draft">
            Simpan rancangan
          </button>
          <button name="action" type="submit" value="publish">
            Terbitkan ke halaman utama
          </button>
        </div>
      </aside>
      <div className="landing-editor__mobile-save" aria-live="polite">
        <span>{hasLocalChanges ? "Perubahan belum disimpan" : "Semua perubahan tersimpan"}</span>
        <button disabled={!hasLocalChanges} name="action" type="submit" value="draft">
          Simpan
        </button>
      </div>
      {sections
        .flatMap((section) => section.fields)
        .filter((item) => !activeSection.fields.includes(item))
        .map((item) => (
          <input key={`preserve-${item.name}`} name={item.name} type="hidden" value={item.get(draft)} />
        ))}
    </form>
  );
}

function MiniLandingPreview({
  activeSectionId,
  content,
  onSelect,
}: {
  activeSectionId: SectionId;
  content: LandingContent;
  onSelect: (id: SectionId) => void;
}) {
  const sectionClass = (id: SectionId) => `landing-mini__section ${activeSectionId === id ? "is-selected" : ""}`;
  const select = (id: SectionId) => () => onSelect(id);
  return (
    <div className="landing-mini" aria-label="Miniatur halaman utama">
      <button className={sectionClass("seo")} onClick={select("seo")} type="button">
        <span className="landing-mini__browser-dot" />
        <span>
          <strong>{content.metadata.title}</strong>
          <small>{content.metadata.description}</small>
        </span>
      </button>
      <button className={sectionClass("topbar")} onClick={select("topbar")} type="button">
        {content.topbar.promise}
      </button>
      <button className={`${sectionClass("hero")} landing-mini__hero`} onClick={select("hero")} type="button">
        <span className="landing-mini__hero-copy">
          <small>CV. ANUGRAHPLASTIK MANDIRI</small>
          <strong>{content.hero.titleBefore}</strong>
          <em>{content.hero.titleHighlight}</em>
          <strong>{content.hero.titleAfter}</strong>
          <span>{content.hero.description}</span>
          <i>{content.hero.primaryCta}</i>
          <b>{content.hero.secondaryCta}</b>
        </span>
        <span className="landing-mini__photo">
          <Image
            alt="Mesin produksi"
            fill
            sizes="(max-width: 820px) 45vw, 150px"
            src="/images-webp/mesin/Anugrah Plastik (71).webp"
          />
        </span>
      </button>
      <button className={`${sectionClass("about")} landing-mini__about`} onClick={select("about")} type="button">
        <span className="landing-mini__part-shape" />
        <span>
          <small>KENALI KAMI</small>
          <strong>{content.about.title}</strong>
          <em>{content.about.body}</em>
        </span>
      </button>
      <button className={sectionClass("why")} onClick={select("why")} type="button">
        <small>KEUNGGULAN</small>
        <strong>{content.why.title}</strong>
        <span className="landing-mini__reason-row">
          <i>01</i>
          <i>02</i>
          <i>03</i>
        </span>
      </button>
      <button className={sectionClass("process")} onClick={select("process")} type="button">
        <small>PROSES PEKERJAAN</small>
        <strong>{content.process.title}</strong>
        <span className="landing-mini__process-row">
          <i>01</i>
          <i>02</i>
          <i>03</i>
          <i>04</i>
        </span>
      </button>
      <button
        className={`${sectionClass("material")} landing-mini__material`}
        onClick={select("material")}
        type="button"
      >
        <span>
          <small>MATERIAL PILIHAN</small>
          <strong>{content.material.title}</strong>
          <i>{content.material.primaryCta}</i>
        </span>
        <span className="landing-mini__material-chips">
          <b>HD</b>
          <b>PP</b>
          <b>Nilon</b>
          <b>PVC</b>
        </span>
      </button>
      <button className={sectionClass("portfolio")} onClick={select("portfolio")} type="button">
        <small>PORTFOLIO</small>
        <strong>{content.portfolio.title}</strong>
        <span className="landing-mini__portfolio-grid">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </button>
      <button className={sectionClass("faq")} onClick={select("faq")} type="button">
        <small>PERTANYAAN</small>
        <strong>{content.faq.title}</strong>
        <em>{content.faq.description}</em>
        <i>{content.faq.primaryCta}</i>
      </button>
      <button className={`${sectionClass("contact")} landing-mini__contact`} onClick={select("contact")} type="button">
        <span>
          <small>MULAI DARI SINI</small>
          <strong>{content.contact.title}</strong>
          <em>{content.contact.description}</em>
        </span>
        <span className="landing-mini__form-sample">
          <b>{content.contact.formTitle}</b>
          <i>{content.contact.formDescription}</i>
          <em>{content.contact.primaryCta}</em>
        </span>
      </button>
      <button className={`${sectionClass("footer")} landing-mini__footer`} onClick={select("footer")} type="button">
        <strong>AP</strong>
        <span>{content.footer.description}</span>
      </button>
    </div>
  );
}
