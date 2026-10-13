"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Role } from "@/lib/auth/session";
import { AdminThemePicker } from "@/components/admin-theme-picker";

type AdminSidebarProps = {
  name: string;
  role: Role;
  onLogout: (formData: FormData) => void | Promise<void>;
  initialTheme: "system" | "light" | "dark";
};

function ContentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 3.75h7l3.25 3.25v13.25H7A2.25 2.25 0 0 1 4.75 18V6A2.25 2.25 0 0 1 7 3.75Z" />
      <path d="M14 3.75V7h3.25M8.25 11h7.5M8.25 14.5h7.5" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m4.5 10 7.5-6 7.5 6v9.25a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75V10Z" />
      <path d="M9.25 20v-5.5h5.5V20" />
    </svg>
  );
}

function ProspectIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.75 20c.4-3.35 2.1-5.25 5.25-5.25s4.85 1.9 5.25 5.25M16.5 8.5h3.75M18.375 6.625v3.75" />
    </svg>
  );
}

function TransactionIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5.25 3.75h10.5l3 3v13.5H5.25A1.5 1.5 0 0 1 3.75 18.75v-13.5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M15.75 3.75v3h3M7.5 11.25h9M7.5 15h6" />
    </svg>
  );
}

function FinanceIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="4" y="5.25" width="16" height="14.5" rx="2" />
      <path d="M7.25 9h9.5M7.25 12.5h5.25M15.75 15.75h1" />
    </svg>
  );
}

function RemoteDesktopIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M8.5 20h7M12 16.5V20" />
    </svg>
  );
}

function MasterIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4.75 7.5 12 3.75l7.25 3.75L12 11.25 4.75 7.5Z" />
      <path d="M4.75 12 12 15.75 19.25 12M4.75 16.5 12 20.25l7.25-3.75" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M13 5h6v6M19 5l-8.25 8.25M18.5 13.5V18A1.5 1.5 0 0 1 17 19.5H6A1.5 1.5 0 0 1 4.5 18V7A1.5 1.5 0 0 1 6 5.5h4.5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3.75" y="5.5" width="16.5" height="13" rx="2" />
      <path d="m4.5 7 7.5 5.5L19.5 7" />
    </svg>
  );
}

function MarketingIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 19.5V4.5M4 19.5h16M8 16v-4m4 4V7m4 9v-6" />
      <path d="m7.5 8.5 4-4 3 2 4-3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
      <circle cx="9" cy="6.5" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="17.5" r="2" />
    </svg>
  );
}

export function AdminSidebar({ name, role, onLogout, initialTheme }: AdminSidebarProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".admin-shell");
    if (shell) shell.dataset.theme = theme;
    document.cookie = `ap-admin-theme=${theme}; Path=/admin; Max-Age=31536000; SameSite=Lax`;
  }, [theme]);
  const navigation = [
    { href: "/admin", label: "Beranda", icon: <HomeIcon /> },
    { href: "/admin/growth", label: "Pemasaran", icon: <MarketingIcon /> },
    ...(role === "admin" || role === "sales"
      ? [{ href: "/admin/transactions", label: "Transaksi", icon: <TransactionIcon /> }]
      : []),
    ...(role === "admin" || role === "sales"
      ? [{ href: "/admin/finance", label: "Keuangan", icon: <FinanceIcon /> }]
      : []),
    ...(role === "admin"
      ? [{ href: "/admin/remote-desktop", label: "Remote Desktop", icon: <RemoteDesktopIcon /> }]
      : []),
    ...(role === "admin" || role === "sales" ? [{ href: "/admin/email", label: "Email CS", icon: <MailIcon /> }] : []),
    { href: "/admin/content", label: "Konten landing", icon: <ContentIcon /> },
    ...(role === "admin" ? [{ href: "/admin/masters", label: "Data master", icon: <MasterIcon /> }] : []),
    ...(role === "sales" ? [{ href: "/admin/masters/designs", label: "File 3D", icon: <MasterIcon /> }] : []),
    ...(role === "admin"
      ? [{ href: "/admin/settings/integrations", label: "Koneksi layanan", icon: <SettingsIcon /> }]
      : []),
    ...(role === "admin"
      ? [{ href: "/admin/settings/email-templates", label: "Template email", icon: <MailIcon /> }]
      : []),
  ];
  const mobilePriority =
    role === "content"
      ? ["/admin", "/admin/content"]
      : ["/admin", "/admin/growth", "/admin/transactions", "/admin/finance"];
  const mobileNavigation = navigation.filter((item) => mobilePriority.includes(item.href));
  const moreNavigation = navigation.filter((item) => !mobilePriority.includes(item.href));

  return (
    <aside className="admin-sidebar">
      <Link className="admin-brand" href="/admin" aria-label="Anugrah Plastik back office">
        <span>AP</span>
        <strong>
          Anugrah Plastik
          <small>Back office</small>
        </strong>
      </Link>

      <nav className="admin-sidebar-nav" aria-label="Menu back office">
        <p>RUANG KERJA</p>
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={
              pathname === item.href ||
              (item.href === "/admin/transactions" && pathname.startsWith("/admin/transactions/")) ||
              (item.href === "/admin/finance" && pathname.startsWith("/admin/finance")) ||
              (item.href === "/admin/remote-desktop" && pathname.startsWith("/admin/remote-desktop")) ||
              (item.href === "/admin/growth" &&
                ["/admin/prospects", "/admin/marketing", "/admin/insights"].includes(pathname))
                ? "page"
                : undefined
            }
            aria-label={item.label}
            title={item.label}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="admin-sidebar-bottom">
        <AdminThemePicker theme={theme} onChange={setTheme} name="admin-theme-desktop" />
        <Link
          className="admin-public-link"
          href="/"
          target="_blank"
          rel="noreferrer"
          aria-label="Lihat landing page"
          title="Lihat landing page"
        >
          <ExternalIcon />
          <span>Lihat landing page</span>
        </Link>
        <Link className="admin-account" href="/admin/profile">
          <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{name}</strong>
            <small>{role === "admin" ? "Administrator" : role === "content" ? "Editor konten" : "Sales"}</small>
          </div>
        </Link>
        <form action={onLogout}>
          <button type="submit" aria-label="Keluar dari ruang kerja" title="Keluar dari ruang kerja">
            <span>Keluar</span>
          </button>
        </form>
      </div>
      <nav className="admin-bottom-nav" aria-label="Navigasi mobile">
        {mobileNavigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={
              pathname === item.href ||
              (item.href === "/admin/transactions" && pathname.startsWith("/admin/transactions/")) ||
              (item.href === "/admin/finance" && pathname.startsWith("/admin/finance")) ||
              (item.href === "/admin/remote-desktop" && pathname.startsWith("/admin/remote-desktop")) ||
              (item.href === "/admin/growth" &&
                ["/admin/prospects", "/admin/marketing", "/admin/insights"].includes(pathname))
                ? "page"
                : undefined
            }
          >
            {item.icon}
            <span>{item.label.replace(" landing", "")}</span>
          </Link>
        ))}
        <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
          <Dialog.Trigger asChild>
            <button aria-expanded={moreOpen} className={moreOpen ? "is-active" : undefined} type="button">
              <MoreIcon />
              <span>Lainnya</span>
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="admin-more-backdrop" />
            <Dialog.Content
              aria-describedby={undefined}
              className="admin-more-sheet"
              data-theme={theme}
              id="admin-more-sheet"
            >
              <div className="admin-more-sheet__head">
                <Dialog.Title>Menu lainnya</Dialog.Title>
                <Dialog.Close aria-label="Tutup menu lainnya" type="button">
                  ×
                </Dialog.Close>
              </div>
              <AdminThemePicker theme={theme} onChange={setTheme} name="admin-theme-mobile" />
              <nav aria-label="Menu lainnya">
                {moreNavigation.map((item) => (
                  <Link href={item.href} key={item.href} onClick={() => setMoreOpen(false)}>
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                ))}
                {role === "admin" ? (
                  <Link href="/admin/team" onClick={() => setMoreOpen(false)}>
                    <ProspectIcon />
                    <span>Kelola tim</span>
                  </Link>
                ) : null}
                <Link href="/admin/profile" onClick={() => setMoreOpen(false)}>
                  <span className="admin-more-avatar">{name.slice(0, 1).toUpperCase()}</span>
                  <span>Profil & perangkat</span>
                </Link>
                <Link href="/" target="_blank" rel="noreferrer">
                  <ExternalIcon />
                  <span>Lihat landing page</span>
                </Link>
              </nav>
              <form action={onLogout}>
                <button type="submit">Keluar dari ruang kerja</button>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </nav>
    </aside>
  );
}
