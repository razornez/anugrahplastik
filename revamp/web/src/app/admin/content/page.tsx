import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { saveLandingContent } from "@/features/content/admin-actions";
import { getDraftLandingContent } from "@/features/content/landing-service";

type Field = { name: string; label: string; value: string; multiline?: boolean };

function ContentSection({ title, fields }: { title: string; fields: Field[] }) {
  return (
    <fieldset className="content-section">
      <legend>{title}</legend>
      <div className="content-fields">
        {fields.map((field) => (
          <label key={field.name}>
            {field.label}
            {field.multiline ? (
              <textarea name={field.name} defaultValue={field.value} required rows={4} />
            ) : (
              <input name={field.name} defaultValue={field.value} required />
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "content")) redirect("/admin/login");

  const [content, query] = await Promise.all([getDraftLandingContent(), searchParams]);
  const message = query.status
    ? query.status === "publish"
      ? "Versi publik sudah diperbarui."
      : "Draft tersimpan. Halaman publik belum berubah."
    : query.error
      ? "Konten belum dapat disimpan. Periksa setiap isian lalu coba kembali."
      : "Perubahan draft tidak akan memengaruhi halaman publik sebelum dipublish.";

  return (
    <section className="admin-card content-card">
      <p>KONTEN LANDING PAGE</p>
      <h1>Kelola isi halaman tanpa mengubah desain</h1>
      <div className="admin-status">{message}</div>
      <p className="content-preview-link">
        <a href="/preview/landing" target="_blank" rel="noreferrer">
          Buka preview draft ↗
        </a>
      </p>
      <form action={saveLandingContent} className="content-editor">
        <ContentSection
          title="SEO"
          fields={[
            { name: "metadata.title", label: "Judul halaman", value: content.metadata.title },
            {
              name: "metadata.description",
              label: "Deskripsi pencarian",
              value: content.metadata.description,
              multiline: true,
            },
          ]}
        />
        <ContentSection
          title="Bar atas"
          fields={[{ name: "topbar.promise", label: "Pesan singkat", value: content.topbar.promise }]}
        />
        <ContentSection
          title="Hero"
          fields={[
            { name: "hero.titleBefore", label: "Judul baris 1", value: content.hero.titleBefore },
            { name: "hero.titleHighlight", label: "Judul sorotan", value: content.hero.titleHighlight },
            { name: "hero.titleAfter", label: "Judul baris 3", value: content.hero.titleAfter },
            { name: "hero.description", label: "Deskripsi", value: content.hero.description, multiline: true },
            { name: "hero.primaryCta", label: "CTA utama", value: content.hero.primaryCta },
            { name: "hero.secondaryCta", label: "CTA kedua", value: content.hero.secondaryCta },
          ]}
        />
        <ContentSection
          title="Profil"
          fields={[
            { name: "about.title", label: "Judul", value: content.about.title },
            { name: "about.body", label: "Deskripsi", value: content.about.body, multiline: true },
          ]}
        />
        <ContentSection title="Keunggulan" fields={[{ name: "why.title", label: "Judul", value: content.why.title }]} />
        <ContentSection
          title="Proses"
          fields={[{ name: "process.title", label: "Judul", value: content.process.title }]}
        />
        <ContentSection
          title="Material"
          fields={[
            { name: "material.title", label: "Judul", value: content.material.title },
            { name: "material.primaryCta", label: "CTA", value: content.material.primaryCta },
          ]}
        />
        <ContentSection
          title="Portfolio"
          fields={[{ name: "portfolio.title", label: "Judul", value: content.portfolio.title }]}
        />
        <ContentSection
          title="FAQ"
          fields={[
            { name: "faq.title", label: "Judul", value: content.faq.title },
            { name: "faq.description", label: "Deskripsi", value: content.faq.description, multiline: true },
            { name: "faq.primaryCta", label: "CTA", value: content.faq.primaryCta },
          ]}
        />
        <ContentSection
          title="Kontak"
          fields={[
            { name: "contact.title", label: "Judul", value: content.contact.title },
            { name: "contact.description", label: "Deskripsi", value: content.contact.description, multiline: true },
            { name: "contact.formTitle", label: "Judul formulir", value: content.contact.formTitle },
            { name: "contact.formDescription", label: "Keterangan formulir", value: content.contact.formDescription },
            { name: "contact.primaryCta", label: "CTA formulir", value: content.contact.primaryCta },
          ]}
        />
        <ContentSection
          title="Footer"
          fields={[
            {
              name: "footer.description",
              label: "Deskripsi perusahaan",
              value: content.footer.description,
              multiline: true,
            },
          ]}
        />
        <div className="admin-actions">
          <button name="action" value="draft" type="submit">
            Simpan draft
          </button>
          <button name="action" value="publish" type="submit">
            Publish ke landing page
          </button>
        </div>
      </form>
    </section>
  );
}
