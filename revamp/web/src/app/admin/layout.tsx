import { getSession } from "@/lib/auth/session";
import { logout } from "@/features/content/admin-actions";
import { AdminSidebar } from "@/components/admin-sidebar";

export const instant = false;

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  if (!session) {
    return <main className="admin-shell admin-shell--public">{children}</main>;
  }

  return (
    <main className="admin-shell">
      <AdminSidebar name={session.name} role={session.role} onLogout={logout} />
      <div className="admin-main">{children}</div>
    </main>
  );
}
