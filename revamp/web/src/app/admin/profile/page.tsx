import Link from "next/link";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import { InstallAppButton } from "@/components/install-app-button";
import { PinInput } from "@/components/pin-input";
import { changeOwnPin, revokeAllOtherSessions, revokeEverySession, revokeOwnSession } from "@/features/auth/actions";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { sessions } from "@/lib/database/schema";

export const instant = false;

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  const query = await searchParams;
  const database = getDatabase();
  const activeSessions = database
    ? await database
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, user.id),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, new Date()),
            gt(sessions.absoluteExpiresAt, new Date()),
          ),
        )
        .orderBy(desc(sessions.lastActiveAt))
    : [];

  return (
    <section className="profile-page" aria-labelledby="profile-title">
      <AdminPageHeader
        title="Profil & perangkat"
        titleId="profile-title"
        description="Kelola akses ruang kerja dan perangkat yang Anda gunakan."
      />
      {query.status ? <p className="admin-notice">Perubahan keamanan berhasil disimpan.</p> : null}
      {query.error ? (
        <p className="admin-notice admin-notice--error">
          {query.error === "current-pin"
            ? "PIN saat ini tidak sesuai."
            : "PIN baru belum dapat disimpan. Periksa enam digit yang dimasukkan."}
        </p>
      ) : null}
      <div className="profile-grid">
        <article className="profile-card">
          <span className="profile-avatar" aria-hidden="true">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <small>Masuk sebagai</small>
            <h2>{user.name}</h2>
            <p>
              @{user.username} · {user.email}
            </p>
            <p className="role-label">
              {user.role === "admin" ? "Administrator" : user.role === "sales" ? "Sales" : "Editor konten"}
            </p>
          </div>
        </article>
        <article className="profile-card profile-card--install">
          <small>Akses cepat</small>
          <h2>Pasang aplikasi</h2>
          <p>Gunakan sebagai aplikasi mandiri untuk membuka ruang kerja lebih cepat.</p>
          <InstallAppButton />
        </article>
        {user.role === "admin" ? (
          <article className="profile-card profile-card--team">
            <small>Administrasi</small>
            <h2>Tim & kredensial</h2>
            <p>Buat akun, atur peran, nonaktifkan akses, atau reset kredensial secara aman.</p>
            <Link href="/admin/team">Kelola tim</Link>
          </article>
        ) : null}
        <section className="profile-card profile-card--security" id="change-pin">
          <small>Keamanan</small>
          <h2>Ganti PIN</h2>
          <form action={changeOwnPin} className="profile-pin-form">
            <label htmlFor="current-pin">PIN saat ini</label>
            <PinInput autoComplete="current-password" id="current-pin" name="currentPin" />
            <label htmlFor="profile-new-pin">PIN baru</label>
            <PinInput id="profile-new-pin" warnWeak />
            <label htmlFor="profile-confirm-pin">Ulangi PIN baru</label>
            <PinInput id="profile-confirm-pin" name="pinConfirmation" />
            <small>PIN berurutan tetap dapat digunakan, tetapi lebih mudah ditebak.</small>
            <button type="submit">Simpan PIN</button>
          </form>
        </section>
        <section className="profile-card profile-card--sessions">
          <div className="profile-session-heading">
            <div>
              <small>Perangkat</small>
              <h2>Sesi aktif</h2>
            </div>
            <div className="profile-session-actions">
              {activeSessions.length > 1 ? (
                <form action={revokeAllOtherSessions}>
                  <button type="submit">Keluar dari perangkat lain</button>
                </form>
              ) : null}
              <form action={revokeEverySession}>
                <button className="is-danger" type="submit">
                  Keluar dari semua perangkat
                </button>
              </form>
            </div>
          </div>
          <div className="profile-session-list">
            {activeSessions.map((entry) => (
              <div className="profile-session-row" key={entry.id}>
                <div>
                  <strong>
                    {entry.deviceLabel || "Browser tidak dikenal"}
                    {entry.id === user.sessionId ? " · Sesi ini" : ""}
                  </strong>
                  <span>
                    {entry.locationLabel || "Lokasi tidak tersedia"} · Aktif{" "}
                    {new Intl.DateTimeFormat("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Jakarta",
                    }).format(entry.lastActiveAt)}
                  </span>
                </div>
                <form action={revokeOwnSession}>
                  <input name="sessionId" type="hidden" value={entry.id} />
                  <button type="submit">Cabut</button>
                </form>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
