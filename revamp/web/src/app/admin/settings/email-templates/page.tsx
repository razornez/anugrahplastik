import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { EmailTemplateSettingsEditor } from "@/components/email-template-settings-editor";
import { EmailTemplateRestoreButton } from "@/components/email-template-restore-button";
import { TemplateAttachmentManager } from "@/components/template-attachment-manager";
import { EmailTemplateCreateDialog } from "@/components/email-template-create-dialog";
import {
  getActiveTemplate,
  listEmailTemplates,
  templateKeys,
  templateLabels,
  type TemplateKey,
} from "@/features/integrations/email-templates";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { emailTemplateAttachments, emailTemplateVersions } from "@/lib/database/schema";
import {
  archiveEmailTemplate,
  duplicateEmailTemplate,
  setDefaultEmailTemplate,
} from "@/features/integrations/email-template-actions";

export const instant = false;

export default async function EmailTemplateSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; template?: string; search?: string; status?: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const query = await searchParams;
  const key: TemplateKey = templateKeys.includes(query.kind as TemplateKey) ? (query.kind as TemplateKey) : "quotation";
  const catalog = await listEmailTemplates(key, query.search);
  const selectedId = catalog.some((entry) => entry.id === query.template)
    ? query.template
    : (catalog.find((entry) => entry.isDefault)?.id ?? catalog[0]?.id);
  const [active, versions, attachments] = await Promise.all([
    getActiveTemplate(key, "id", selectedId),
    getDatabase()
      ?.select()
      .from(emailTemplateVersions)
      .where(selectedId ? eq(emailTemplateVersions.templateId, selectedId) : eq(emailTemplateVersions.templateKey, key))
      .orderBy(desc(emailTemplateVersions.version))
      .limit(8) ?? [],
    selectedId
      ? (getDatabase()
          ?.select({
            id: emailTemplateAttachments.id,
            filename: emailTemplateAttachments.filename,
            size: emailTemplateAttachments.size,
            scanStatus: emailTemplateAttachments.scanStatus,
          })
          .from(emailTemplateAttachments)
          .where(eq(emailTemplateAttachments.templateId, selectedId))
          .orderBy(emailTemplateAttachments.createdAt) ?? [])
      : [],
  ]);
  return (
    <section className="admin-page email-template-settings">
      <AdminPageHeader
        title="Template"
        description="Kelola isi, bahasa, versi, default, dan lampiran tetap untuk email transaksi."
        back={{ href: "/admin", label: "Kembali ke beranda" }}
      />
      <nav className="template-area-segments" aria-label="Area template">
        <Link aria-current="page" href="/admin/settings/email-templates">
          Email
        </Link>
        <Link href="/admin/settings/templates?area=pdf">Dokumen PDF</Link>
      </nav>
      {query.status === "saved" || query.status === "created" ? (
        <p className="admin-notice" role="status">
          {query.status === "created" ? "Template baru siap diedit." : "Versi template baru sudah aktif."}
        </p>
      ) : null}
      <form className="email-template-catalog-filter" method="get">
        <label>
          Jenis dokumen
          <select defaultValue={key} name="kind">
            {templateKeys.map((kind) => (
              <option key={kind} value={kind}>
                {templateLabels[kind]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cari template
          <input defaultValue={query.search ?? ""} name="search" placeholder="Nama atau bahasa" />
        </label>
        <button type="submit">Terapkan</button>
      </form>
      <div className="email-template-notice">
        <strong>Perubahan langsung berlaku setelah Anda menyetujui konfirmasi.</strong>
        <span>Periksa pratinjau lebih dulu. Dokumen contoh dan aturan penerimanya tetap dibatasi.</span>
      </div>
      <div className="email-template-catalog-layout">
        <aside className="email-template-catalog-list" aria-label="Daftar template">
          {catalog.map((template) => (
            <div
              className="email-template-catalog-row"
              data-current={template.id === selectedId ? "true" : undefined}
              key={template.id}
            >
              <Link href={`/admin/settings/email-templates?kind=${key}&template=${template.id}`}>
                <strong>{template.name}</strong>
                <span>
                  {template.language === "id" ? "Bahasa Indonesia" : template.language}
                  {template.isDefault ? " · Default" : ""}
                </span>
                <small>Diperbarui {template.updatedAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</small>
              </Link>
              {!(["layout", "new", "reply"] as string[]).includes(key) ? (
                <details className="email-template-catalog-menu">
                  <summary aria-label={`Aksi lain untuk ${template.name}`}>•••</summary>
                  <div>
                    {!template.isDefault ? (
                      <form action={setDefaultEmailTemplate}>
                        <input name="templateId" type="hidden" value={template.id} />
                        <button type="submit">Jadikan default</button>
                      </form>
                    ) : null}
                    <form action={duplicateEmailTemplate}>
                      <input name="templateId" type="hidden" value={template.id} />
                      <input name="name" type="hidden" value={`${template.name} salinan`} />
                      <button type="submit">Duplikat</button>
                    </form>
                    {!template.isDefault ? (
                      <form action={archiveEmailTemplate}>
                        <input name="templateId" type="hidden" value={template.id} />
                        <button className="is-danger" type="submit">
                          Arsipkan
                        </button>
                      </form>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>
          ))}
          {!catalog.length ? <p className="admin-empty-copy">Belum ada template untuk filter ini.</p> : null}
          {!(["layout", "new", "reply"] as string[]).includes(key) ? (
            <EmailTemplateCreateDialog templateKey={key} />
          ) : null}
        </aside>
        <div className="email-template-catalog-editor">
          {selectedId ? (
            <EmailTemplateSettingsEditor
              key={selectedId}
              templateId={selectedId}
              keyName={key}
              subject={active.subject}
              initial={active.content}
              shellConfig={active.shellConfig}
            />
          ) : null}
          {selectedId && ["quotation", "invoice", "delivery", "handover"].includes(key) ? (
            <TemplateAttachmentManager attachments={attachments} templateId={selectedId} />
          ) : null}
        </div>
      </div>
      {versions.length ? (
        <section className="email-template-history">
          <h2>Riwayat versi</h2>
          <div>
            {versions.map((version) => (
              <div className="email-template-history__row" key={version.id}>
                <span>
                  Versi {version.version} · {version.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
                  {version.id === active.id ? " · Aktif" : ""}
                </span>
                {version.id !== active.id ? (
                  <EmailTemplateRestoreButton versionId={version.id} version={version.version} />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
