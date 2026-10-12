import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import { LandingContentEditor } from "@/components/landing-content-editor";
import { restoreLandingRevision, saveLandingContent } from "@/features/content/admin-actions";
import { getLandingEditorialRecord } from "@/features/content/landing-service";
import { getSession } from "@/lib/auth/session";

export const instant = false;

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/admin/login");

  const [record, query] = await Promise.all([getLandingEditorialRecord(), searchParams]);
  const canEdit = user.role === "admin" || user.role === "content";
  const message = query.status
    ? query.status === "publish" || query.status === "restore"
      ? "Perubahan sudah tampil di halaman utama."
      : "Perubahan disimpan sebagai rancangan. Halaman utama belum berubah."
    : query.error === "conflict"
      ? "Konten sudah diubah pengguna lain. Muat ulang halaman sebelum menyimpan kembali."
      : query.error === "copy"
        ? "Gunakan kalimat, koma, atau titik. Jangan memakai strip sebagai pemisah teks."
        : query.error
          ? "Perubahan belum dapat disimpan. Periksa isian lalu coba lagi."
          : "Perubahan di sini aman untuk dicoba. Halaman utama hanya berubah saat diterbitkan.";

  return (
    <section className="content-workspace" aria-labelledby="content-title">
      <AdminPageHeader
        title="Konten halaman utama"
        titleId="content-title"
        description="Pilih bagian, perbarui pesan, lalu periksa hasilnya sebelum menerbitkan."
      />
      <LandingContentEditor
        action={saveLandingContent}
        canEdit={canEdit}
        content={record.content}
        hasUnpublishedDraft={record.hasUnpublishedDraft}
        message={
          canEdit ? message : "Mode baca-saja untuk Sales. Konten publik dan draft dapat diperiksa tanpa mengubahnya."
        }
        publishedAt={record.publishedAt}
        restoreAction={restoreLandingRevision}
        revisions={record.revisions}
        updatedAt={record.updatedAt}
        version={record.version}
      />
    </section>
  );
}
