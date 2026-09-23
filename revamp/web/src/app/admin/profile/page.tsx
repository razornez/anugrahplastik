import Link from "next/link";
import { redirect } from "next/navigation";
import { InstallAppButton } from "@/components/install-app-button";
import { getSession } from "@/lib/auth/session";

export const instant = false;

export default async function ProfilePage() {
  const user = await getSession();
  if (!user) redirect("/admin/login");

  return (
    <section className="profile-page" aria-labelledby="profile-title">
      <p className="eyebrow">Pengaturan pribadi</p>
      <h1 id="profile-title">Profil & perangkat</h1>
      <p className="profile-intro">Kelola akses ruang kerja dan cara aplikasi ini digunakan di perangkat Anda.</p>
      <div className="profile-grid">
        <article className="profile-card">
          <span className="profile-avatar" aria-hidden="true">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <small>Masuk sebagai</small>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
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
      </div>
    </section>
  );
}
