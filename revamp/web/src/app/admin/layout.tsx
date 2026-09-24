import { getSession } from "@/lib/auth/session";
import { logout } from "@/features/content/admin-actions";
import { AdminSidebar } from "@/components/admin-sidebar";
import type { Metadata } from "next";

export const instant = false;

export const metadata: Metadata = {
  title: { absolute: "Back Office | Anugrah Plastik" },
  description: "Ruang kerja internal Anugrah Plastik.",
  robots: { index: false, follow: false, nocache: true },
};

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
