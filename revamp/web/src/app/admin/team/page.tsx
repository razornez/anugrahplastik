import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import { createTeamMember, toggleTeamMember } from "@/features/workspace/team-actions";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const user = await getSession();
  if (user?.role !== "admin") redirect("/admin/login");
  const database = getDatabase();
  const members = database ? await database.select().from(users).orderBy(desc(users.createdAt)) : [];
  const query = await searchParams;
  return (
    <div className="team-page">
      <header className="workspace-topbar">
        <div>
          <p className="eyebrow">Tim</p>
          <h1>Akses ruang kerja</h1>
          <span>Owner mengatur peran, status akun, password, dan PIN setiap anggota.</span>
        </div>
      </header>
      {query.status === "created" ? (
        <p className="admin-notice">Akun baru berhasil dibuat. Bagikan kredensial melalui jalur internal yang aman.</p>
      ) : null}
      {query.error ? (
        <p className="admin-notice admin-notice--error">
          Akun belum dapat dibuat. Periksa kembali email, password minimal 12 karakter, dan PIN enam digit.
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
                  {member.email} · {member.role}
                </small>
              </div>
              <form action={toggleTeamMember}>
                <input type="hidden" name="id" value={member.id} />
                <input type="hidden" name="isActive" value={String(!member.isActive)} />
                <button disabled={member.id === user.id} type="submit">
                  {member.isActive ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </form>
            </article>
          ))}
        </section>
        <section className="member-create">
          <p className="eyebrow">Akun baru</p>
          <h2>Tambahkan anggota</h2>
          <form action={createTeamMember}>
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
            <label>
              Password sementara
              <input name="password" type="password" minLength={12} required />
            </label>
            <label>
              PIN enam digit
              <input name="pin" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required />
            </label>
            <button type="submit">Buat akun</button>
          </form>
        </section>
      </div>
    </div>
  );
}
