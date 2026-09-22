import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { saveLandingContent } from "@/features/content/admin-actions";
import { getDraftLandingContent } from "@/features/content/landing-service";

type Field = { name: string; label: string; value: string; multiline?: boolean };

function ContentSection({ id, title, fields }: { id: string; title: string; fields: Field[] }) {
  return (
    <fieldset className="content-section" id={id}>
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
  if (!user) redirect("/admin/login");

  const [content, query] = await Promise.all([getDraftLandingContent(), searchParams]);
  const message = query.status
    ? query.status === "publish"
      ? "Versi publik sudah diperbarui."
      : "Draft tersimpan. Halaman publik belum berubah."
    : query.error
      ? "Konten belum dapat disimpan. Periksa setiap isian lalu coba kembali."
      : "Perubahan draft tidak akan memengaruhi halaman publik sebelum dipublish.";

  return (
    <section className="content-workspace" aria-labelledby="content-title">
      <header className="content-workspace-head">
        <div>
          <p className="eyebrow">Konten landing</p>
          <h1 id="content-title">Perbarui pesan tanpa menggeser desain.</h1>
          <p>Setiap perubahan disimpan sebagai draft terlebih dahulu; versi publik hanya berubah saat dipublish.</p>
        </div>
      </header>
      <form action={saveLandingContent} className="content-editor">
        <aside className="content-index" aria-label="Bagian konten">
          <p>Bagian halaman</p>
          {[
            ["seo", "SEO"],
            ["topbar", "Bar atas"],
            ["hero", "Hero"],
            ["about", "Profil"],
            ["why", "Keunggulan"],
            ["process", "Proses"],
            ["material", "Material"],
            ["portfolio", "Portfolio"],
            ["faq", "FAQ"],
            ["contact", "Kontak"],
            ["footer", "Footer"],
          ].map(([id, label]) => (
            <a href={`#${id}`} key={id}>
              {label}
            </a>
          ))}
        </aside>
        <div className="content-form-panel">
          <div className="admin-status">{message}</div>
          <ContentSection
            id="seo"
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
            id="topbar"
            title="Bar atas"
            fields={[{ name: "topbar.promise", label: "Pesan singkat", value: content.topbar.promise }]}
          />
          <ContentSection
            id="hero"
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
            id="about"
            title="Profil"
            fields={[
              { name: "about.title", label: "Judul", value: content.about.title },
              { name: "about.body", label: "Deskripsi", value: content.about.body, multiline: true },
            ]}
          />
          <ContentSection
            id="why"
            title="Keunggulan"
            fields={[{ name: "why.title", label: "Judul", value: content.why.title }]}
          />
          <ContentSection
            id="process"
            title="Proses"
            fields={[{ name: "process.title", label: "Judul", value: content.process.title }]}
          />
          <ContentSection
            id="material"
            title="Material"
            fields={[
              { name: "material.title", label: "Judul", value: content.material.title },
              { name: "material.primaryCta", label: "CTA", value: content.material.primaryCta },
            ]}
          />
          <ContentSection
            id="portfolio"
            title="Portfolio"
            fields={[{ name: "portfolio.title", label: "Judul", value: content.portfolio.title }]}
          />
          <ContentSection
            id="faq"
            title="FAQ"
            fields={[
              { name: "faq.title", label: "Judul", value: content.faq.title },
              { name: "faq.description", label: "Deskripsi", value: content.faq.description, multiline: true },
              { name: "faq.primaryCta", label: "CTA", value: content.faq.primaryCta },
            ]}
          />
          <ContentSection
            id="contact"
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
            id="footer"
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
        </div>
        <aside className="content-publish-panel">
          <p className="eyebrow">Status versi</p>
          <h2>Draft siap ditinjau.</h2>
          <p>Preview menunjukkan draft saat ini. Publish memperbarui landing page dan mencatat revisi.</p>
          <a href="/preview/landing" target="_blank" rel="noreferrer">
            Buka preview ↗
          </a>
          <div className="admin-actions">
            <button name="action" value="draft" type="submit">
              Simpan draft
            </button>
            <button name="action" value="publish" type="submit">
              Publish ke landing page
            </button>
          </div>
          <small>Perubahan penting tercatat pada jejak kerja.</small>
        </aside>
      </form>
    </section>
  );
}
