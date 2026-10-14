import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import { DocumentTemplateEditor } from "@/components/document-template-editor";
import {
  defaultDocumentTemplateConfigs,
  documentTemplateKinds,
  documentTemplateLabels,
  getDocumentTemplateState,
  type DocumentTemplateKind,
} from "@/features/operations/document-templates";
import { getSession } from "@/lib/auth/session";

export const instant = false;

export default async function TemplateSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; kind?: string; status?: string; error?: string; field?: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const query = await searchParams;
  if (query.area !== "pdf") redirect("/admin/settings/email-templates");
  const kind: DocumentTemplateKind = documentTemplateKinds.includes(query.kind as DocumentTemplateKind)
    ? (query.kind as DocumentTemplateKind)
    : "quotation";
  const state = await getDocumentTemplateState(kind);
  const initial =
    (state.active?.config as Record<string, string | number> | null) ?? defaultDocumentTemplateConfigs[kind];
  const error =
    query.error === "validation"
      ? `Periksa kembali ${query.field ?? "isian"}. Versi lama tetap aktif.`
      : query.error === "publish"
        ? "Versi baru gagal divalidasi atau dirender. Versi lama tetap aktif dan tidak berubah."
        : query.error
          ? "Template belum dapat disimpan. Coba lagi."
          : null;
  return (
    <section className="admin-page document-template-settings">
      <AdminPageHeader
        title="Template"
        description="Atur email dan konten terarah dokumen PDF tanpa mengubah struktur yang dilindungi."
        back={{ href: "/admin", label: "Kembali ke beranda" }}
      />
      <nav className="template-area-segments" aria-label="Area template">
        <Link href="/admin/settings/email-templates">Email</Link>
        <Link aria-current="page" href="/admin/settings/templates?area=pdf">
          Dokumen PDF
        </Link>
      </nav>
      {query.status ? (
        <p className="integration-success">Versi baru sudah lolos validasi dan menjadi versi aktif.</p>
      ) : null}
      <div className="document-template-kind-list" aria-label="Jenis dokumen">
        {documentTemplateKinds.map((item) => {
          const active = state.kind === item ? state.active : null;
          return (
            <Link
              aria-current={item === kind ? "page" : undefined}
              href={`/admin/settings/templates?area=pdf&kind=${item}`}
              key={item}
            >
              <span>{documentTemplateLabels[item]}</span>
              {item === kind && active ? <small>v{active.version}</small> : null}
            </Link>
          );
        })}
      </div>
      <DocumentTemplateEditor
        activeVersion={state.active?.version}
        error={error}
        initial={initial}
        kind={kind}
        versions={state.versions.map((version) => ({
          id: version.id,
          version: version.version,
          status: version.status,
          createdAt: version.createdAt,
          activatedAt: version.activatedAt,
        }))}
      />
    </section>
  );
}
