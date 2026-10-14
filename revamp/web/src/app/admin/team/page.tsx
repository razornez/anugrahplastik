import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, authRateLimits, users } from "@/lib/database/schema";
import { createTeamMember, toggleTeamMember, unlockTeamMember } from "@/features/workspace/team-actions";
import { EmergencyPinForm } from "@/components/emergency-pin-form";

export const instant = false;

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const user = await getSession();
  if (user?.role !== "admin") redirect("/admin/login");
  const database = getDatabase();
  const [members, requiredNotices, sentNotices, activeLocks] = database
    ? await Promise.all([
        database.select().from(users).orderBy(desc(users.createdAt)),
        database
          .select({ userId: auditLogs.entityId })
          .from(auditLogs)
          .where(and(eq(auditLogs.action, "auth.cutover_notice_required"), eq(auditLogs.entityType, "user"))),
        database
          .select({ userId: auditLogs.entityId })
          .from(auditLogs)
          .where(and(eq(auditLogs.action, "auth.cutover_notice_sent"), eq(auditLogs.entityType, "user"))),
        database
          .selectDistinct({ userId: authRateLimits.userId })
          .from(authRateLimits)
          .where(and(isNotNull(authRateLimits.userId), gt(authRateLimits.lockedUntil, new Date()))),
      ])
    : [[], [], [], []];
  const sentNoticeIds = new Set(sentNotices.map((entry) => entry.userId));
  const lockedUserIds = new Set(activeLocks.map((entry) => entry.userId));
  const pendingNoticeCount = requiredNotices.filter((entry) => !sentNoticeIds.has(entry.userId)).length;
  const query = await searchParams;
  return (
    <div className="team-page">
      <AdminPageHeader
        title="Akses ruang kerja"
        description="Kelola username, peran, aktivasi, dan keamanan akun anggota tim."
      />
      {query.status === "created" ? (
        <p className="admin-notice">Akun dibuat. Email aktivasi dan username telah dikirim.</p>
      ) : query.status === "created-mail-failed" ? (
        <p className="admin-notice admin-notice--error">
          Akun dibuat, tetapi email aktivasi gagal dikirim. Gunakan PIN darurat bila perlu.
        </p>
      ) : null}
      {pendingNoticeCount ? (
        <p className="admin-notice admin-notice--error" role="status">
          {pendingNoticeCount} pemberitahuan username cutover masih menunggu Email CS. Scheduler akan mencoba lagi tanpa
          membatalkan akses akun.
        </p>
      ) : null}
      {query.error ? (
        <p className="admin-notice admin-notice--error">
          {query.error === "last-admin"
            ? "Administrator aktif terakhir tidak dapat dinonaktifkan."
            : "Akun belum dapat dibuat. Periksa username, email, dan data yang mungkin sudah digunakan."}
        </p>
      ) : null}
      <div className="team-layout">
        <section className="member-list">
          <h2>Anggota tim</h2>
          {members.map((member) => (
            <article key={member.id}>
              <span className="prospect-initial">{member.name.slice(0, 1)}</span>
              <div>
                <strong>{member.name}</strong>
                <small>
                  @{member.username} · {member.role}
                </small>
                <small>{member.email}</small>
              </div>
              <div className="member-row-actions">
                {lockedUserIds.has(member.id) ? (
                  <form action={unlockTeamMember}>
                    <input type="hidden" name="id" value={member.id} />
                    <button type="submit">Buka kunci</button>
                  </form>
                ) : null}
                <EmergencyPinForm id={member.id} />
                <form action={toggleTeamMember}>
                  <input type="hidden" name="id" value={member.id} />
                  <input type="hidden" name="isActive" value={String(!member.isActive)} />
                  <button disabled={member.id === user.id} type="submit">
                    {member.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </form>
              </div>
            </article>
          ))}
        </section>
        <section className="member-create">
          <p className="eyebrow">Akun baru</p>
          <h2>Tambahkan anggota</h2>
          <form action={createTeamMember}>
            <label>
              Username
              <input name="username" pattern="[a-z0-9.]{3,24}" minLength={3} maxLength={24} required />
              <small>
                Lowercase, 3 sampai 24 karakter, huruf, angka, atau titik. Tidak dapat diubah setelah aktif.
              </small>
            </label>
            <label>
              Nama
              <input name="name" required />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Peran
              <select name="role" defaultValue="sales">
                <option value="sales">Sales</option>
                <option value="content">Editor konten</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <button type="submit">Buat akun</button>
          </form>
        </section>
      </div>
    </div>
  );
}
