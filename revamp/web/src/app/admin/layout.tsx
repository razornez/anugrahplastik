import { getSession } from "@/lib/auth/session";
import Link from "next/link";
import { logout } from "@/features/auth/actions";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminToastProvider } from "@/components/admin-ui";
import { AdminInstallProvider } from "@/components/admin-install-provider";
import { SessionExpiryBanner } from "@/components/session-expiry-banner";
import { markNotificationRead } from "@/features/auth/notification-actions";
import { getDatabase } from "@/lib/database/client";
import { userNotifications } from "@/lib/database/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DM_Sans, Poppins } from "next/font/google";
import "./admin-home.css";
import "./admin-design.css";

const adminUi = DM_Sans({ subsets: ["latin"], variable: "--font-admin-ui", display: "swap" });
const adminDisplay = Poppins({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-admin-display",
  display: "swap",
});
const adminFonts = `${adminUi.variable} ${adminDisplay.variable}`;

export const instant = false;

export const metadata: Metadata = {
  title: { absolute: "Back Office | Anugrah Plastik" },
  description: "Ruang kerja internal Anugrah Plastik.",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const savedTheme = (await cookies()).get("ap-admin-theme")?.value;
  const theme = savedTheme === "system" || savedTheme === "dark" ? savedTheme : "light";

  if (!session) {
    return (
      <main className={`${adminFonts} admin-shell admin-shell--public`} data-theme={theme}>
        <AdminToastProvider>{children}</AdminToastProvider>
      </main>
    );
  }
  const database = getDatabase();
  const notifications = database
    ? await database
        .select()
        .from(userNotifications)
        .where(and(eq(userNotifications.userId, session.id), isNull(userNotifications.readAt)))
        .orderBy(desc(userNotifications.createdAt))
        .limit(3)
    : [];

  return (
    <AdminInstallProvider>
      <main className={`${adminFonts} admin-shell`} data-theme={theme}>
        <AdminSidebar name={session.name} role={session.role} onLogout={logout} initialTheme={theme} />
        <AdminToastProvider>
          <div className="admin-main" data-ui-surface="page" id="admin-main" tabIndex={-1}>
            {!session.remembered ? (
              <SessionExpiryBanner initialExpiresAt={session.sessionExpiresAt.toISOString()} />
            ) : null}
            {notifications.length ? (
              <aside className="admin-notification-banner" aria-label="Notifikasi penting">
                <div>
                  <strong>{notifications[0].title}</strong>
                  <span>{notifications[0].body}</span>
                  {notifications.length > 1 ? (
                    <small>{notifications.length - 1} notifikasi penting lainnya.</small>
                  ) : null}
                </div>
                <div>
                  {notifications[0].href ? <Link href={notifications[0].href}>Periksa</Link> : null}
                  <form action={markNotificationRead}>
                    <input name="id" type="hidden" value={notifications[0].id} />
                    <button type="submit">Tandai dibaca</button>
                  </form>
                </div>
              </aside>
            ) : null}
            {session.temporaryPin ? (
              <aside className="admin-security-banner" role="status">
                <div>
                  <strong>Ganti PIN sementara</strong>
                  <span>Gunakan PIN pribadi agar akses akun tetap aman.</span>
                </div>
                <Link href="/admin/profile#change-pin">Ganti PIN</Link>
              </aside>
            ) : null}
            {children}
          </div>
        </AdminToastProvider>
      </main>
    </AdminInstallProvider>
  );
}
