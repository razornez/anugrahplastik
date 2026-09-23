import { redirect } from "next/navigation";
import { LandingContentEditor } from "@/components/landing-content-editor";
import { saveLandingContent } from "@/features/content/admin-actions";
import { getDraftLandingContent } from "@/features/content/landing-service";
import { getSession } from "@/lib/auth/session";

export const instant = false;

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
      ? "Perubahan sudah tampil di halaman utama."
      : "Perubahan disimpan sebagai rancangan. Halaman utama belum berubah."
    : query.error
      ? "Perubahan belum dapat disimpan. Periksa isian lalu coba lagi."
      : "Perubahan di sini aman untuk dicoba. Halaman utama hanya berubah saat diterbitkan.";

  return (
    <section className="content-workspace" aria-labelledby="content-title">
      <header className="content-workspace-head">
        <div>
          <p className="eyebrow">Isi halaman utama</p>
          <h1 id="content-title">Perbarui pesan sambil melihat letaknya.</h1>
          <p>Pilih satu bagian, ubah pesannya, lalu periksa hasilnya di mini landing sebelum menerbitkan.</p>
        </div>
      </header>
      <LandingContentEditor action={saveLandingContent} content={content} message={message} />
    </section>
  );
}
