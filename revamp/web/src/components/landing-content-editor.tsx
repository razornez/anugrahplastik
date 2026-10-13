"use client";

import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { LandingContent } from "@/features/content/landing-content";

type SectionId =
  | "seo"
  | "topbar"
  | "hero"
  | "about"
  | "why"
  | "process"
  | "material"
  | "portfolio"
  | "trust"
  | "evidence"
  | "faq"
  | "contact"
  | "footer";

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
    description: "Kelola kategori, urutan, foto, keterangan, dan label produk unggulan.",
    fields: [
      field(
        "portfolio.title",
        "Judul",
        (c) => c.portfolio.title,
        (c, v) => ({ ...c, portfolio: { ...c.portfolio, title: v } }),
      ),
    ],
  },
  {
    id: "trust",
    label: "Klien & mitra",
    eyebrow: "Kepercayaan",
    title: "Logo dan bukti kerja sama",
    description: "Tampilkan logo atau foto klien dan mitra yang memang sudah diizinkan untuk dipublikasikan.",
    fields: [
      field(
        "trust.title",
        "Judul",
        (c) => c.trust.title,
        (c, v) => ({ ...c, trust: { ...c.trust, title: v } }),
      ),
      field(
        "trust.description",
        "Deskripsi",
        (c) => c.trust.description,
        (c, v) => ({ ...c, trust: { ...c.trust, description: v } }),
        true,
      ),
    ],
  },
  {
    id: "evidence",
    label: "Bukti & galeri",
    eyebrow: "Bukti nyata",
    title: "Kapabilitas, proses, dan galeri kategori",
    description:
      "Tampilkan hanya bukti yang sudah disetujui. Kategori publik wajib memiliki gambar, alt text, dan produk.",
    fields: [],
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

type Revision = { id: string; version: number; action: string; createdAt: Date; actorName: string | null };

function LandingSubmitButton({
  children,
  disabled,
  pendingLabel = "Menyimpan…",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <button {...props} aria-busy={pending} disabled={disabled || pending}>
      {pending ? <span className="admin-spinner" aria-hidden="true" /> : null}
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
}

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  restoreAction: (revisionId: string, formData: FormData) => void | Promise<void>;
  content: LandingContent;
  message: string;
  version: number;
  publishedAt: Date | null;
  updatedAt: Date | null;
  hasUnpublishedDraft: boolean;
  revisions: Revision[];
  canEdit: boolean;
};

export function LandingContentEditor({
  action,
  restoreAction,
  content,
  message,
  version,
  publishedAt,
  updatedAt,
  hasUnpublishedDraft,
  revisions,
  canEdit,
}: Props) {
  const [draft, setDraft] = useState(content);
  const [activeSectionId, setActiveSectionId] = useState<SectionId>("hero");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [publishOpen, setPublishOpen] = useState(false);
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
  const selectEditorView = (view: "edit" | "preview") => setMobileView(view);
  const onViewTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const views = ["edit", "preview"] as const;
    const currentIndex = views.indexOf(mobileView);
    const nextView =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? views[(currentIndex + 1) % views.length]
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? views[(currentIndex - 1 + views.length) % views.length]
          : event.key === "Home"
            ? views[0]
            : event.key === "End"
              ? views[views.length - 1]
              : null;

    if (!nextView) return;

    event.preventDefault();
    selectEditorView(nextView);
    requestAnimationFrame(() => document.getElementById(`landing-editor-${nextView}-tab`)?.focus());
  };

  return (
    <form action={action} className={`landing-editor landing-editor--${mobileView}`}>
      <input name="content-json" type="hidden" value={JSON.stringify(draft)} />
      <input name="expected-version" type="hidden" value={version} />
      <div className="landing-editor__mobile-controls" aria-label="Kontrol editor">
        <div className="landing-editor__view-tabs" role="tablist" aria-label="Tampilan editor">
          <button
            aria-controls="landing-editor-edit"
            aria-selected={mobileView === "edit"}
            id="landing-editor-edit-tab"
            onClick={() => selectEditorView("edit")}
            onKeyDown={onViewTabKeyDown}
            role="tab"
            tabIndex={mobileView === "edit" ? 0 : -1}
            type="button"
          >
            Edit
          </button>
          <button
            aria-controls="landing-editor-preview"
            aria-selected={mobileView === "preview"}
            id="landing-editor-preview-tab"
            onClick={() => selectEditorView("preview")}
            onKeyDown={onViewTabKeyDown}
            role="tab"
            tabIndex={mobileView === "preview" ? 0 : -1}
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
        <div className="landing-editor__index-head">
          <p>Bagian halaman</p>
          <span aria-label={`${activeIndex + 1} dari ${sections.length} bagian dipilih`}>
            {activeIndex + 1}/{sections.length}
          </span>
        </div>
        <div aria-hidden="true" className="landing-editor__index-progress">
          <i style={{ width: `${((activeIndex + 1) / sections.length) * 100}%` }} />
        </div>
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
      <section
        className="landing-editor__form"
        aria-labelledby="landing-editor-edit-tab"
        id="landing-editor-edit"
        role="tabpanel"
        tabIndex={0}
      >
        <div className="landing-editor__context">
          <div className="landing-editor__version" aria-label="Status konten">
            <span className={hasUnpublishedDraft ? "is-draft" : "is-public"}>
              {hasUnpublishedDraft ? "Draft aktif" : "Selaras dengan publik"}
            </span>
            <strong>Versi {version || "baru"}</strong>
            {updatedAt ? (
              <small>
                Diperbarui {updatedAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} WIB
              </small>
            ) : null}
          </div>
          <p className="landing-editor__safety" role="status">
            {message}
          </p>
        </div>
        <div className="landing-editor__section-head">
          <p className="eyebrow">{activeSection.eyebrow}</p>
          <h2 id={`section-${activeSection.id}`}>{activeSection.title}</h2>
          <p>{activeSection.description}</p>
        </div>
        <fieldset className="landing-editor__fields" disabled={!canEdit}>
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
          {activeSectionId === "evidence" || activeSectionId === "why" || activeSectionId === "process" ? (
            <EvidenceFields content={draft} onChange={setDraft} disabled={!canEdit} />
          ) : null}
          {activeSectionId === "about" ||
          activeSectionId === "material" ||
          activeSectionId === "portfolio" ||
          activeSectionId === "trust" ||
          activeSectionId === "faq" ? (
            <LandingVisualFields
              activeSectionId={activeSectionId}
              content={draft}
              disabled={!canEdit}
              onChange={setDraft}
            />
          ) : null}
        </fieldset>
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
      <aside
        className="landing-editor__preview"
        aria-label="Mini landing untuk melihat perubahan"
        aria-labelledby="landing-editor-preview-tab"
        id="landing-editor-preview"
        role="tabpanel"
        tabIndex={0}
      >
        <div className="landing-editor__preview-head">
          <div>
            <p className="eyebrow">Pratinjau langsung</p>
            <h2>Lihat sebelum tayang</h2>
          </div>
          <span className={hasLocalChanges ? "is-unsaved" : ""}>
            {hasLocalChanges ? "Belum disimpan" : "Tersimpan"}
          </span>
        </div>
        <p className="landing-editor__preview-note">
          Bagian berbingkai biru sesuai dengan bagian yang sedang Anda edit.
        </p>
        <MiniLandingPreview activeSectionId={activeSectionId} content={draft} onSelect={selectSection} />
        <div className="landing-editor__publish">
          <a href="/preview/landing" rel="noreferrer" target="_blank">
            Buka landing penuh ↗
          </a>
          <LandingSubmitButton disabled={!canEdit || !hasLocalChanges} name="action" type="submit" value="draft">
            Simpan rancangan
          </LandingSubmitButton>
          <button
            disabled={!canEdit || !hasLocalChanges}
            onClick={(event) => {
              event.preventDefault();
              setPublishOpen(true);
            }}
            type="button"
          >
            Terbitkan ke halaman utama
          </button>
        </div>
        <details className="landing-editor__history" aria-label="Riwayat revisi">
          <summary>
            Riwayat revisi <span>{revisions.length || 0}</span>
          </summary>
          {revisions.length ? (
            revisions.slice(0, 5).map((revision) => (
              <div key={revision.id}>
                <span>
                  v{revision.version} ·{" "}
                  {revision.action === "publish" || revision.action === "restore" ? "Terbit" : "Draft"}
                </span>
                <small>{revision.actorName ?? "Pengguna"}</small>
                {canEdit ? (
                  <LandingSubmitButton
                    formAction={restoreAction.bind(null, revision.id)}
                    pendingLabel="Memulihkan…"
                    type="submit"
                  >
                    Pulihkan & terbitkan
                  </LandingSubmitButton>
                ) : null}
              </div>
            ))
          ) : (
            <p>Belum ada riwayat tersimpan.</p>
          )}
          {publishedAt ? (
            <small>
              Publik terakhir: {publishedAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} WIB
            </small>
          ) : null}
        </details>
      </aside>
      <div className="landing-editor__mobile-save" aria-live="polite">
        <span>{hasLocalChanges ? "Perubahan belum disimpan" : "Semua perubahan tersimpan"}</span>
        <LandingSubmitButton disabled={!canEdit || !hasLocalChanges} name="action" type="submit" value="draft">
          Simpan
        </LandingSubmitButton>
      </div>
      {publishOpen ? (
        <div className="landing-editor__confirm" role="dialog" aria-modal="true" aria-labelledby="publish-title">
          <div>
            <p className="eyebrow">Konfirmasi publikasi</p>
            <h2 id="publish-title">Terbitkan versi berikutnya?</h2>
            <p>Perubahan draft akan segera menggantikan isi landing page publik.</p>
            <span>
              <button onClick={() => setPublishOpen(false)} type="button">
                Kembali
              </button>
              <LandingSubmitButton name="action" pendingLabel="Menerbitkan…" type="submit" value="publish">
                Terbitkan sekarang
              </LandingSubmitButton>
            </span>
          </div>
        </div>
      ) : null}
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

function EvidenceFields({
  content,
  onChange,
  disabled,
}: {
  content: LandingContent;
  onChange: React.Dispatch<React.SetStateAction<LandingContent>>;
  disabled: boolean;
}) {
  const set = <K extends keyof LandingContent>(key: K, value: LandingContent[K]) =>
    onChange((current) => ({ ...current, [key]: value }));
  return (
    <div className="landing-editor__evidence">
      <p>Gunakan informasi yang dapat dibuktikan. Kategori hanya tampil publik jika semua detailnya lengkap.</p>
      <fieldset>
        <legend>Kapabilitas</legend>
        {content.capabilities.map((item, index) => (
          <div className="landing-editor__repeat" key={`cap-${index}`}>
            <input
              aria-label={`Judul kapabilitas ${index + 1}`}
              disabled={disabled}
              value={item.title}
              onChange={(event) =>
                set(
                  "capabilities",
                  content.capabilities.map((value, position) =>
                    position === index ? { ...value, title: event.target.value } : value,
                  ),
                )
              }
            />
            <textarea
              aria-label={`Penjelasan kapabilitas ${index + 1}`}
              disabled={disabled}
              value={item.description}
              onChange={(event) =>
                set(
                  "capabilities",
                  content.capabilities.map((value, position) =>
                    position === index ? { ...value, description: event.target.value } : value,
                  ),
                )
              }
            />
            <input
              aria-label={`Bukti kapabilitas ${index + 1}`}
              disabled={disabled}
              value={item.proof}
              onChange={(event) =>
                set(
                  "capabilities",
                  content.capabilities.map((value, position) =>
                    position === index ? { ...value, proof: event.target.value } : value,
                  ),
                )
              }
              placeholder="Bukti, mis. pemeriksaan QC setiap batch"
            />
          </div>
        ))}
        {content.capabilities.length < 6 ? (
          <button
            disabled={disabled}
            type="button"
            onClick={() => set("capabilities", [...content.capabilities, { title: "", description: "", proof: "" }])}
          >
            + Tambah kapabilitas
          </button>
        ) : null}
      </fieldset>
      <fieldset>
        <legend>Galeri kategori</legend>
        {content.galleryCategories.map((item, index) => (
          <div className="landing-editor__repeat" key={`gallery-${index}`}>
            <input
              aria-label={`Judul kategori ${index + 1}`}
              disabled={disabled}
              value={item.title}
              onChange={(event) =>
                set(
                  "galleryCategories",
                  content.galleryCategories.map((value, position) =>
                    position === index ? { ...value, title: event.target.value } : value,
                  ),
                )
              }
              placeholder="Judul kategori"
            />
            <input
              aria-label={`Slug kategori ${index + 1}`}
              disabled={disabled}
              value={item.slug}
              onChange={(event) =>
                set(
                  "galleryCategories",
                  content.galleryCategories.map((value, position) =>
                    position === index
                      ? { ...value, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }
                      : value,
                  ),
                )
              }
              placeholder="slug-kategori"
            />
            <input
              aria-label={`Path gambar kategori ${index + 1}`}
              disabled={disabled}
              value={item.imagePath}
              onChange={(event) =>
                set(
                  "galleryCategories",
                  content.galleryCategories.map((value, position) =>
                    position === index ? { ...value, imagePath: event.target.value } : value,
                  ),
                )
              }
              placeholder="/images-webp/...webp"
            />
            <input
              aria-label={`Alt gambar kategori ${index + 1}`}
              disabled={disabled}
              value={item.altText}
              onChange={(event) =>
                set(
                  "galleryCategories",
                  content.galleryCategories.map((value, position) =>
                    position === index ? { ...value, altText: event.target.value } : value,
                  ),
                )
              }
              placeholder="Deskripsi gambar"
            />
            <textarea
              aria-label={`Produk kategori ${index + 1}`}
              disabled={disabled}
              value={item.products.join("\n")}
              onChange={(event) =>
                set(
                  "galleryCategories",
                  content.galleryCategories.map((value, position) =>
                    position === index
                      ? {
                          ...value,
                          products: event.target.value
                            .split("\n")
                            .map((product) => product.trim())
                            .filter(Boolean)
                            .slice(0, 6),
                        }
                      : value,
                  ),
                )
              }
              placeholder="Satu produk per baris (maks. 6)"
            />
            <label>
              <input
                checked={item.isPublished}
                disabled={disabled}
                type="checkbox"
                onChange={(event) =>
                  set(
                    "galleryCategories",
                    content.galleryCategories.map((value, position) =>
                      position === index ? { ...value, isPublished: event.target.checked } : value,
                    ),
                  )
                }
              />{" "}
              Tampilkan di landing
            </label>
          </div>
        ))}
        {content.galleryCategories.length < 12 ? (
          <button
            disabled={disabled}
            type="button"
            onClick={() =>
              set("galleryCategories", [
                ...content.galleryCategories,
                {
                  title: "",
                  slug: "",
                  imagePath: "",
                  altText: "",
                  products: [],
                  ctaLabel: "Selengkapnya",
                  isPublished: false,
                },
              ])
            }
          >
            + Tambah kategori
          </button>
        ) : null}
      </fieldset>
      <fieldset>
        <legend>Langkah proses</legend>
        {content.processSteps.map((item, index) => (
          <div className="landing-editor__repeat" key={`step-${index}`}>
            <input
              aria-label={`Judul langkah ${index + 1}`}
              disabled={disabled}
              value={item.title}
              onChange={(event) =>
                set(
                  "processSteps",
                  content.processSteps.map((value, position) =>
                    position === index ? { ...value, title: event.target.value } : value,
                  ),
                )
              }
              placeholder="Judul langkah"
            />
            <textarea
              aria-label={`Penjelasan langkah ${index + 1}`}
              disabled={disabled}
              value={item.description}
              onChange={(event) =>
                set(
                  "processSteps",
                  content.processSteps.map((value, position) =>
                    position === index ? { ...value, description: event.target.value } : value,
                  ),
                )
              }
              placeholder="Penjelasan singkat"
            />
          </div>
        ))}
        {content.processSteps.length < 6 ? (
          <button
            disabled={disabled}
            type="button"
            onClick={() => set("processSteps", [...content.processSteps, { title: "", description: "" }])}
          >
            + Tambah langkah
          </button>
        ) : null}
      </fieldset>
      <fieldset>
        <legend>Testimoni yang disetujui</legend>
        {content.testimonials.map((item, index) => (
          <div className="landing-editor__repeat" key={`testimonial-${index}`}>
            <input
              aria-label={`Nama testimoni ${index + 1}`}
              disabled={disabled}
              value={item.name}
              onChange={(event) =>
                set(
                  "testimonials",
                  content.testimonials.map((value, position) =>
                    position === index ? { ...value, name: event.target.value } : value,
                  ),
                )
              }
              placeholder="Nama / perusahaan"
            />
            <input
              aria-label={`Peran testimoni ${index + 1}`}
              disabled={disabled}
              value={item.role}
              onChange={(event) =>
                set(
                  "testimonials",
                  content.testimonials.map((value, position) =>
                    position === index ? { ...value, role: event.target.value } : value,
                  ),
                )
              }
              placeholder="Peran atau industri"
            />
            <textarea
              aria-label={`Kutipan testimoni ${index + 1}`}
              disabled={disabled}
              value={item.quote}
              onChange={(event) =>
                set(
                  "testimonials",
                  content.testimonials.map((value, position) =>
                    position === index ? { ...value, quote: event.target.value } : value,
                  ),
                )
              }
              placeholder="Kutipan yang telah disetujui"
            />
            <label>
              <input
                checked={item.isPublished}
                disabled={disabled}
                type="checkbox"
                onChange={(event) =>
                  set(
                    "testimonials",
                    content.testimonials.map((value, position) =>
                      position === index ? { ...value, isPublished: event.target.checked } : value,
                    ),
                  )
                }
              />{" "}
              Tampilkan di landing
            </label>
          </div>
        ))}
        {content.testimonials.length < 12 ? (
          <button
            disabled={disabled}
            type="button"
            onClick={() =>
              set("testimonials", [...content.testimonials, { name: "", role: "", quote: "", isPublished: false }])
            }
          >
            + Tambah testimoni
          </button>
        ) : null}
      </fieldset>
      <fieldset>
        <legend>Insight pilihan</legend>
        {content.featuredInsights.map((item, index) => (
          <div className="landing-editor__repeat" key={`insight-${index}`}>
            <input
              aria-label={`Kategori insight ${index + 1}`}
              disabled={disabled}
              value={item.category}
              onChange={(event) =>
                set(
                  "featuredInsights",
                  content.featuredInsights.map((value, position) =>
                    position === index ? { ...value, category: event.target.value } : value,
                  ),
                )
              }
              placeholder="Kategori"
            />
            <input
              aria-label={`Judul insight ${index + 1}`}
              disabled={disabled}
              value={item.title}
              onChange={(event) =>
                set(
                  "featuredInsights",
                  content.featuredInsights.map((value, position) =>
                    position === index ? { ...value, title: event.target.value } : value,
                  ),
                )
              }
              placeholder="Judul insight"
            />
            <input
              aria-label={`Slug insight ${index + 1}`}
              disabled={disabled}
              value={item.slug}
              onChange={(event) =>
                set(
                  "featuredInsights",
                  content.featuredInsights.map((value, position) =>
                    position === index
                      ? { ...value, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }
                      : value,
                  ),
                )
              }
              placeholder="slug-insight"
            />
            <textarea
              aria-label={`Ringkasan insight ${index + 1}`}
              disabled={disabled}
              value={item.excerpt}
              onChange={(event) =>
                set(
                  "featuredInsights",
                  content.featuredInsights.map((value, position) =>
                    position === index ? { ...value, excerpt: event.target.value } : value,
                  ),
                )
              }
              placeholder="Ringkasan insight"
            />
            <label>
              <input
                checked={item.isPublished}
                disabled={disabled}
                type="checkbox"
                onChange={(event) =>
                  set(
                    "featuredInsights",
                    content.featuredInsights.map((value, position) =>
                      position === index ? { ...value, isPublished: event.target.checked } : value,
                    ),
                  )
                }
              />{" "}
              Tampilkan di landing
            </label>
          </div>
        ))}
        {content.featuredInsights.length < 3 ? (
          <button
            disabled={disabled}
            type="button"
            onClick={() =>
              set("featuredInsights", [
                ...content.featuredInsights,
                { slug: "", category: "", title: "", excerpt: "", isPublished: false },
              ])
            }
          >
            + Tambah insight
          </button>
        ) : null}
      </fieldset>
    </div>
  );
}

type LandingMediaAsset = { id: string; url: string; previewUrl: string; altText: string; byteSize: number };

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function LandingMediaPicker({
  value,
  altText,
  disabled,
  onChange,
  onAltTextChange,
}: {
  value: string;
  altText: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onAltTextChange: (value: string) => void;
}) {
  const [assets, setAssets] = useState<LandingMediaAsset[]>([]);
  const [used, setUsed] = useState(0);
  const [quota, setQuota] = useState(500 * 1024 * 1024);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const loadAssets = async ({ append = false, next = "" }: { append?: boolean; next?: string } = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "24" });
      if (query.trim()) params.set("q", query.trim());
      if (next) params.set("cursor", next);
      const response = await fetch(`/api/admin/landing-media?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        assets?: LandingMediaAsset[];
        nextCursor?: string | null;
        used?: number;
        quota?: number;
        error?: string;
      };
      if (!response.ok || !payload.assets) throw new Error(payload.error ?? "Pustaka media belum dapat dimuat.");
      setAssets((current) => (append ? [...current, ...payload.assets!] : payload.assets!));
      setCursor(payload.nextCursor ?? null);
      setUsed(payload.used ?? 0);
      setQuota(payload.quota ?? 500 * 1024 * 1024);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pustaka media belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!altText.trim()) {
      setMessage("Isi alt text sebelum mengunggah gambar.");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("altText", altText);
    setUploading(true);
    setUploadProgress(0);
    setMessage("Mengunggah dan mengoptimalkan gambar…");
    try {
      const payload = await new Promise<{ asset?: LandingMediaAsset; error?: string }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/api/admin/landing-media");
        request.responseType = "json";
        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
        });
        request.addEventListener("load", () => {
          const body = request.response as { asset?: LandingMediaAsset; error?: string } | null;
          if (request.status < 200 || request.status >= 300)
            reject(new Error(body?.error ?? "Gambar belum dapat diunggah."));
          else resolve(body ?? {});
        });
        request.addEventListener("error", () => reject(new Error("Koneksi terputus. Silakan coba unggah kembali.")));
        request.addEventListener("abort", () => reject(new Error("Upload dibatalkan.")));
        request.send(formData);
      });
      if (!payload.asset) throw new Error(payload.error ?? "Gambar belum dapat diunggah.");
      onChange(payload.asset.url);
      setAssets((current) => [payload.asset!, ...current.filter((asset) => asset.id !== payload.asset!.id)]);
      setUsed((current) => current + payload.asset!.byteSize);
      setMessage("Gambar siap digunakan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gambar belum dapat diunggah.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };
  const preview = value.startsWith("/api/media/")
    ? `${value.replace("/api/media/", "/api/admin/landing-media/")}?size=small`
    : value;
  return (
    <div className="landing-media-picker">
      <label>
        Alt text gambar
        <input disabled={disabled} onChange={(event) => onAltTextChange(event.target.value)} value={altText} />
      </label>
      <div className="landing-media-picker__current">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={altText || "Pratinjau gambar"} src={preview} />
        ) : null}
        <div className="landing-media-picker__actions">
          <label className="landing-media-picker__upload">
            {uploading ? `Mengunggah ${uploadProgress || ""}${uploadProgress ? "%" : "…"}` : "Unggah gambar"}
            <input
              accept="image/jpeg,image/png,image/webp"
              className="admin-sr-only"
              disabled={disabled || uploading}
              onChange={(event) => void upload(event.target.files?.[0])}
              type="file"
            />
          </label>
          <Dialog.Root onOpenChange={setOpen} open={open}>
            <Dialog.Trigger asChild>
              <button
                disabled={disabled || uploading}
                onClick={() => {
                  if (!assets.length) void loadAssets();
                }}
                type="button"
              >
                Pilih dari pustaka
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="landing-media-dialog__overlay" />
              <Dialog.Content className="landing-media-dialog">
                <span className="landing-media-dialog__handle" aria-hidden="true" />
                <header>
                  <span>
                    <Dialog.Title>Pustaka media</Dialog.Title>
                    <Dialog.Description>Pilih gambar yang sudah ada atau cari berdasarkan alt text.</Dialog.Description>
                  </span>
                  <Dialog.Close aria-label="Tutup pustaka media">×</Dialog.Close>
                </header>
                <form
                  className="landing-media-dialog__search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void loadAssets();
                  }}
                >
                  <label htmlFor="landing-media-search">Cari gambar</label>
                  <span>
                    <input
                      id="landing-media-search"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Contoh: spacer atau logo"
                      value={query}
                    />
                    <button disabled={loading} type="submit">
                      {loading ? "Mencari…" : "Cari"}
                    </button>
                  </span>
                </form>
                <p className="landing-media-dialog__quota">
                  Pustaka memakai {(used / 1024 / 1024).toFixed(1)} MB dari {(quota / 1024 / 1024).toFixed(0)} MB.
                </p>
                {message && !uploading ? (
                  <p className="landing-media-dialog__message" role="status">
                    {message}
                  </p>
                ) : null}
                {loading && !assets.length ? (
                  <div className="landing-media-dialog__loading" aria-label="Memuat media">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                ) : null}
                {assets.length ? (
                  <div className="landing-media-picker__assets" aria-label="Pilih gambar dari pustaka">
                    {assets.map((asset) => (
                      <button
                        aria-label={`Pilih ${asset.altText}`}
                        aria-pressed={asset.url === value}
                        disabled={disabled}
                        key={asset.id}
                        onClick={() => {
                          onChange(asset.url);
                          setOpen(false);
                        }}
                        type="button"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="" src={`/api/admin/landing-media/${asset.id}?size=small`} />
                        <span>{asset.altText}</span>
                      </button>
                    ))}
                  </div>
                ) : !loading ? (
                  <p className="landing-media-dialog__empty">Belum ada gambar yang cocok.</p>
                ) : null}
                {cursor ? (
                  <button
                    className="landing-media-dialog__more"
                    disabled={loading}
                    onClick={() => void loadAssets({ append: true, next: cursor })}
                    type="button"
                  >
                    {loading ? "Memuat…" : "Muat gambar berikutnya"}
                  </button>
                ) : null}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
      <p aria-live="polite" data-state={message.includes("belum") || message.includes("terputus") ? "error" : "status"}>
        {message || "Gambar dapat diganti tanpa mengubah susunan landing."}
      </p>
    </div>
  );
}

function LandingEditorItem({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <details className="landing-editor__repeat landing-editor__item">
      <summary>
        <span>
          <strong>{title}</strong>
          {meta ? <small>{meta}</small> : null}
        </span>
        <span className="landing-editor__item-action">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Zm9.5-9.5 4 4" />
          </svg>
          Edit
        </span>
      </summary>
      <div className="landing-editor__item-fields">{children}</div>
    </details>
  );
}

function LandingVisualFields({
  activeSectionId,
  content,
  onChange,
  disabled,
}: {
  activeSectionId: SectionId;
  content: LandingContent;
  onChange: React.Dispatch<React.SetStateAction<LandingContent>>;
  disabled: boolean;
}) {
  const set = (next: LandingContent) => onChange(next);
  if (activeSectionId === "faq") {
    return (
      <div className="landing-editor__evidence">
        <fieldset>
          <legend>Pertanyaan dan jawaban</legend>
          {content.faq.items.map((item, index) => (
            <LandingEditorItem
              key={`faq-${index}`}
              meta={`Pertanyaan ${index + 1}`}
              title={item.question || "Pertanyaan baru"}
            >
              <input
                aria-label={`Pertanyaan ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    faq: {
                      ...content.faq,
                      items: content.faq.items.map((value, position) =>
                        position === index ? { ...value, question: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.question}
              />
              <textarea
                aria-label={`Jawaban ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    faq: {
                      ...content.faq,
                      items: content.faq.items.map((value, position) =>
                        position === index ? { ...value, answer: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.answer}
              />
              <button
                disabled={disabled || content.faq.items.length <= 1}
                onClick={() =>
                  set({
                    ...content,
                    faq: { ...content.faq, items: content.faq.items.filter((_, position) => position !== index) },
                  })
                }
                type="button"
              >
                Hapus pertanyaan
              </button>
            </LandingEditorItem>
          ))}
          <button
            disabled={disabled || content.faq.items.length >= 8}
            onClick={() =>
              set({
                ...content,
                faq: {
                  ...content.faq,
                  items: [...content.faq.items, { question: "Pertanyaan baru", answer: "Jawaban singkat dan jelas." }],
                },
              })
            }
            type="button"
          >
            + Tambah pertanyaan
          </button>
        </fieldset>
      </div>
    );
  }
  if (activeSectionId === "about") {
    return (
      <div className="landing-editor__evidence">
        <fieldset>
          <legend>Foto dan statistik Tentang Kami</legend>
          <LandingMediaPicker
            altText={content.about.image.altText}
            disabled={disabled}
            onAltTextChange={(altText) =>
              set({ ...content, about: { ...content.about, image: { ...content.about.image, altText } } })
            }
            onChange={(imagePath) =>
              set({ ...content, about: { ...content.about, image: { ...content.about.image, imagePath } } })
            }
            value={content.about.image.imagePath}
          />
          <label>
            Label di atas foto
            <input
              disabled={disabled}
              onChange={(event) => set({ ...content, about: { ...content.about, imageBadge: event.target.value } })}
              value={content.about.imageBadge}
            />
          </label>
          {content.about.stats.map((item, index) => (
            <div className="landing-editor__repeat" key={`stat-${index}`}>
              <input
                aria-label={`Angka statistik ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    about: {
                      ...content.about,
                      stats: content.about.stats.map((value, position) =>
                        position === index ? { ...value, value: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.value}
              />
              <input
                aria-label={`Label statistik ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    about: {
                      ...content.about,
                      stats: content.about.stats.map((value, position) =>
                        position === index ? { ...value, label: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.label}
              />
            </div>
          ))}
        </fieldset>
      </div>
    );
  }
  if (activeSectionId === "material") {
    return (
      <div className="landing-editor__evidence">
        <fieldset>
          <legend>Kartu material</legend>
          {content.material.items.map((item, index) => (
            <LandingEditorItem
              key={`material-${index}`}
              meta={item.code || `Material ${index + 1}`}
              title={item.name || "Material baru"}
            >
              <input
                aria-label={`Kode material ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    material: {
                      ...content.material,
                      items: content.material.items.map((value, position) =>
                        position === index ? { ...value, code: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.code}
              />
              <input
                aria-label={`Nama material ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    material: {
                      ...content.material,
                      items: content.material.items.map((value, position) =>
                        position === index ? { ...value, name: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.name}
              />
              <textarea
                aria-label={`Deskripsi material ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    material: {
                      ...content.material,
                      items: content.material.items.map((value, position) =>
                        position === index ? { ...value, description: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.description}
              />
              <LandingMediaPicker
                altText={item.altText}
                disabled={disabled}
                onAltTextChange={(altText) =>
                  set({
                    ...content,
                    material: {
                      ...content.material,
                      items: content.material.items.map((value, position) =>
                        position === index ? { ...value, altText } : value,
                      ),
                    },
                  })
                }
                onChange={(imagePath) =>
                  set({
                    ...content,
                    material: {
                      ...content.material,
                      items: content.material.items.map((value, position) =>
                        position === index ? { ...value, imagePath } : value,
                      ),
                    },
                  })
                }
                value={item.imagePath}
              />
              <button
                disabled={disabled || index === 0}
                onClick={() =>
                  set({
                    ...content,
                    material: { ...content.material, items: moveItem(content.material.items, index, -1) },
                  })
                }
                type="button"
              >
                Geser ke atas
              </button>
              <button
                disabled={disabled || index === content.material.items.length - 1}
                onClick={() =>
                  set({
                    ...content,
                    material: { ...content.material, items: moveItem(content.material.items, index, 1) },
                  })
                }
                type="button"
              >
                Geser ke bawah
              </button>
              <button
                disabled={disabled || content.material.items.length <= 1}
                onClick={() =>
                  set({
                    ...content,
                    material: {
                      ...content.material,
                      items: content.material.items.filter((_, position) => position !== index),
                    },
                  })
                }
                type="button"
              >
                Hapus material
              </button>
            </LandingEditorItem>
          ))}
          <button
            disabled={disabled || content.material.items.length >= 12}
            onClick={() =>
              set({
                ...content,
                material: {
                  ...content.material,
                  items: [
                    ...content.material.items,
                    { code: "", name: "", description: "", imagePath: "/images-webp/materials/hdpe.webp", altText: "" },
                  ],
                },
              })
            }
            type="button"
          >
            + Tambah material
          </button>
        </fieldset>
      </div>
    );
  }
  if (activeSectionId === "portfolio") {
    return (
      <div className="landing-editor__evidence">
        <fieldset>
          <legend>Kategori portfolio</legend>
          {content.portfolio.filters.map((item, index) => (
            <div className="landing-editor__repeat" key={`filter-${item.id}`}>
              <input
                aria-label={`ID kategori ${index + 1}`}
                disabled={disabled || item.id === "all"}
                onChange={(event) =>
                  set({
                    ...content,
                    portfolio: {
                      ...content.portfolio,
                      filters: content.portfolio.filters.map((value, position) =>
                        position === index
                          ? { ...value, id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }
                          : value,
                      ),
                    },
                  })
                }
                value={item.id}
              />
              <input
                aria-label={`Label kategori ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    portfolio: {
                      ...content.portfolio,
                      filters: content.portfolio.filters.map((value, position) =>
                        position === index ? { ...value, label: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.label}
              />
            </div>
          ))}
        </fieldset>
        <fieldset>
          <legend>Produk dan hasil produksi</legend>
          {content.portfolio.items.map((item, index) => (
            <LandingEditorItem
              key={`portfolio-${item.id}`}
              meta={`${item.isPublished ? "Tampil" : "Disembunyikan"}${item.isHot ? " · Produk unggulan" : ""}`}
              title={item.title || `Produk ${index + 1}`}
            >
              <input
                aria-label={`ID portfolio ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    portfolio: {
                      ...content.portfolio,
                      items: content.portfolio.items.map((value, position) =>
                        position === index
                          ? { ...value, id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }
                          : value,
                      ),
                    },
                  })
                }
                value={item.id}
              />
              <input
                aria-label={`Judul portfolio ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    portfolio: {
                      ...content.portfolio,
                      items: content.portfolio.items.map((value, position) =>
                        position === index ? { ...value, title: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.title}
              />
              <select
                aria-label={`Kategori portfolio ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    portfolio: {
                      ...content.portfolio,
                      items: content.portfolio.items.map((value, position) =>
                        position === index ? { ...value, category: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.category}
              >
                {content.portfolio.filters
                  .filter((filter) => filter.id !== "all")
                  .map((filter) => (
                    <option key={filter.id} value={filter.id}>
                      {filter.label}
                    </option>
                  ))}
              </select>
              <textarea
                aria-label={`Keterangan portfolio ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    portfolio: {
                      ...content.portfolio,
                      items: content.portfolio.items.map((value, position) =>
                        position === index ? { ...value, caption: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.caption}
              />
              <label>
                <input
                  checked={item.isHot}
                  disabled={disabled}
                  onChange={(event) =>
                    set({
                      ...content,
                      portfolio: {
                        ...content.portfolio,
                        items: content.portfolio.items.map((value, position) =>
                          position === index ? { ...value, isHot: event.target.checked } : value,
                        ),
                      },
                    })
                  }
                  type="checkbox"
                />{" "}
                Produk unggulan
              </label>
              <label>
                <input
                  checked={item.isPublished}
                  disabled={disabled}
                  onChange={(event) =>
                    set({
                      ...content,
                      portfolio: {
                        ...content.portfolio,
                        items: content.portfolio.items.map((value, position) =>
                          position === index ? { ...value, isPublished: event.target.checked } : value,
                        ),
                      },
                    })
                  }
                  type="checkbox"
                />{" "}
                Tampilkan
              </label>
              <LandingMediaPicker
                altText={item.altText}
                disabled={disabled}
                onAltTextChange={(altText) =>
                  set({
                    ...content,
                    portfolio: {
                      ...content.portfolio,
                      items: content.portfolio.items.map((value, position) =>
                        position === index ? { ...value, altText } : value,
                      ),
                    },
                  })
                }
                onChange={(imagePath) =>
                  set({
                    ...content,
                    portfolio: {
                      ...content.portfolio,
                      items: content.portfolio.items.map((value, position) =>
                        position === index ? { ...value, imagePath } : value,
                      ),
                    },
                  })
                }
                value={item.imagePath}
              />
              <button
                disabled={disabled || content.portfolio.items.length <= 1}
                onClick={() =>
                  set({
                    ...content,
                    portfolio: {
                      ...content.portfolio,
                      items: content.portfolio.items.filter((_, position) => position !== index),
                    },
                  })
                }
                type="button"
              >
                Hapus produk
              </button>
            </LandingEditorItem>
          ))}
          <button
            disabled={disabled || content.portfolio.items.length >= 60}
            onClick={() =>
              set({
                ...content,
                portfolio: {
                  ...content.portfolio,
                  items: [
                    ...content.portfolio.items,
                    {
                      id: `produk-${content.portfolio.items.length + 1}`,
                      title: "Produk baru",
                      category: content.portfolio.filters.find((item) => item.id !== "all")?.id ?? "produk",
                      caption: "Keterangan produk.",
                      imagePath: "/images-webp/products/frame-grid-hitam.webp",
                      altText: "Produk plastik",
                      isPublished: false,
                      isHot: false,
                    },
                  ],
                },
              })
            }
            type="button"
          >
            + Tambah produk
          </button>
        </fieldset>
      </div>
    );
  }
  if (activeSectionId === "trust") {
    return (
      <div className="landing-editor__evidence">
        <fieldset>
          <legend>Logo klien dan mitra</legend>
          {content.trust.partners.map((item, index) => (
            <LandingEditorItem
              key={`partner-${index}`}
              meta={item.isFeatured ? "Mitra unggulan" : `Mitra ${index + 1}`}
              title={item.name || "Mitra baru"}
            >
              <input
                aria-label={`Nama mitra ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    trust: {
                      ...content.trust,
                      partners: content.trust.partners.map((value, position) =>
                        position === index ? { ...value, name: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.name}
              />
              <input
                aria-label={`Keterangan mitra ${index + 1}`}
                disabled={disabled}
                onChange={(event) =>
                  set({
                    ...content,
                    trust: {
                      ...content.trust,
                      partners: content.trust.partners.map((value, position) =>
                        position === index ? { ...value, subtitle: event.target.value } : value,
                      ),
                    },
                  })
                }
                value={item.subtitle}
              />
              <label>
                <input
                  checked={item.isFeatured}
                  disabled={disabled}
                  onChange={(event) =>
                    set({
                      ...content,
                      trust: {
                        ...content.trust,
                        partners: content.trust.partners.map((value, position) =>
                          position === index ? { ...value, isFeatured: event.target.checked } : value,
                        ),
                      },
                    })
                  }
                  type="checkbox"
                />{" "}
                Mitra unggulan
              </label>
              <LandingMediaPicker
                altText={item.altText}
                disabled={disabled}
                onAltTextChange={(altText) =>
                  set({
                    ...content,
                    trust: {
                      ...content.trust,
                      partners: content.trust.partners.map((value, position) =>
                        position === index ? { ...value, altText } : value,
                      ),
                    },
                  })
                }
                onChange={(imagePath) =>
                  set({
                    ...content,
                    trust: {
                      ...content.trust,
                      partners: content.trust.partners.map((value, position) =>
                        position === index ? { ...value, imagePath } : value,
                      ),
                    },
                  })
                }
                value={item.imagePath}
              />
              <button
                disabled={disabled}
                onClick={() =>
                  set({
                    ...content,
                    trust: {
                      ...content.trust,
                      partners: content.trust.partners.filter((_, position) => position !== index),
                    },
                  })
                }
                type="button"
              >
                Hapus mitra
              </button>
            </LandingEditorItem>
          ))}
          <button
            disabled={disabled || content.trust.partners.length >= 24}
            onClick={() =>
              set({
                ...content,
                trust: {
                  ...content.trust,
                  partners: [
                    ...content.trust.partners,
                    {
                      name: "Mitra baru",
                      subtitle: "",
                      imagePath: "/images-webp/products/frame-grid-hitam.webp",
                      altText: "Logo mitra",
                      isFeatured: false,
                    },
                  ],
                },
              })
            }
            type="button"
          >
            + Tambah mitra
          </button>
        </fieldset>
      </div>
    );
  }
  return null;
}
