import { getSession } from "@/lib/auth/session";
import { logout } from "@/features/content/admin-actions";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminToastProvider } from "@/components/admin-ui";
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

  return (
    <main className={`${adminFonts} admin-shell`} data-theme={theme}>
      <AdminSidebar name={session.name} role={session.role} onLogout={logout} initialTheme={theme} />
      <AdminToastProvider>
        <div className="admin-main" data-ui-surface="page" id="admin-main" tabIndex={-1}>
          {children}
        </div>
      </AdminToastProvider>
    </main>
  );
}
