import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { contentBlocks } from "@/lib/database/schema";
import { saveLandingContent } from "@/features/content/admin-actions";
import { defaultLandingContent, LANDING_CONTENT_KEY } from "@/features/content/landing-content";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const user = await getSession();
  if (!user || (user.role !== "admin" && user.role !== "content")) redirect("/admin/login");
  const database = getDatabase();
  const [record] = database
    ? await database.select().from(contentBlocks).where(eq(contentBlocks.key, LANDING_CONTENT_KEY))
    : [];
  const { status, error } = await searchParams;
  const content = JSON.stringify(record?.content ?? defaultLandingContent, null, 2);

  return (
    <section className="admin-card content-card">
      <p>KONTEN LANDING PAGE</p>
      <h1>Draft, preview, dan publish</h1>
      <div className="admin-status">
        {status
          ? `Konten berhasil ${status === "publish" ? "dipublish" : "disimpan sebagai draft"}.`
          : error
            ? "Konten belum dapat disimpan. Periksa koneksi dan struktur data."
            : "Edit nilai metadata dan binding tanpa mengubah desain."}
      </div>
      <form action={saveLandingContent}>
        <label>
          Dokumen konten
          <textarea name="content" defaultValue={content} spellCheck="false" required />
        </label>
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
