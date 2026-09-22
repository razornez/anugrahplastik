import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { logout } from "@/features/content/admin-actions";

export const instant = false;

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <nav className="admin-navigation" aria-label="Navigasi admin">
          <Link href="/admin/content">Konten</Link>
          {session?.role === "admin" ? <Link href="/admin/insights">Insight</Link> : null}
        </nav>
        {session ? (
          <form action={logout}>
            <span>{session.name}</span>
            <button type="submit">Keluar</button>
          </form>
        ) : null}
      </header>
      {children}
    </main>
  );
}
