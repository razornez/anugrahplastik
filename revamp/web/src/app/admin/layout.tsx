import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { logout } from "@/features/content/admin-actions";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <Link href="/admin/content">Anugrah Plastik · Admin</Link>
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
