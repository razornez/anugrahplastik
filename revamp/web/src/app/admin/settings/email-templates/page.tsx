import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { EmailTemplateSettingsEditor } from "@/components/email-template-settings-editor";
import { EmailTemplateKindPicker } from "@/components/email-template-kind-picker";
import { EmailTemplateRestoreButton } from "@/components/email-template-restore-button";
import {
  getActiveTemplate,
  templateKeys,
  templateLabels,
  type TemplateKey,
} from "@/features/integrations/email-templates";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { emailTemplateVersions } from "@/lib/database/schema";

export const instant = false;

export default async function EmailTemplateSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const query = await searchParams;
  const key: TemplateKey = templateKeys.includes(query.kind as TemplateKey) ? (query.kind as TemplateKey) : "layout";
  const [active, versions] = await Promise.all([
    getActiveTemplate(key),
    getDatabase()
      ?.select()
      .from(emailTemplateVersions)
      .where(eq(emailTemplateVersions.templateKey, key))
      .orderBy(desc(emailTemplateVersions.version))
      .limit(8) ?? [],
  ]);
  return (
    <section className="admin-page email-template-settings">
      <AdminPageHeader
        title="Template email"
        description="Kelola template email back office; lampiran PDF tetap berasal dari DocGen."
        back={{ href: "/admin", label: "Kembali ke beranda" }}
      />
      <nav className="email-template-kind-nav" aria-label="Jenis template email">
        {templateKeys.map((kind) => (
          <Link
            key={kind}
            href={`/admin/settings/email-templates?kind=${kind}`}
            aria-current={kind === key ? "page" : undefined}
          >
            {templateLabels[kind]}
          </Link>
        ))}
      </nav>
      <EmailTemplateKindPicker value={key} />
      <div className="email-template-notice">
        <strong>Perubahan langsung berlaku setelah Anda menyetujui konfirmasi.</strong>
        <span>Periksa pratinjau lebih dulu. Dokumen contoh dan aturan penerimanya tetap dibatasi.</span>
      </div>
      <EmailTemplateSettingsEditor
        key={key}
        keyName={key}
        subject={active.subject}
        initial={active.content}
        shellConfig={active.shellConfig}
      />
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
