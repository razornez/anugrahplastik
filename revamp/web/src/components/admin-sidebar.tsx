"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth/session";

type AdminSidebarProps = {
  name: string;
  role: Role;
  onLogout: (formData: FormData) => void | Promise<void>;
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

function InsightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4.75 19.25V4.75M4.75 19.25h14.5M8.5 16v-4.25M12 16V8M15.5 16v-6.5" />
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

export function AdminSidebar({ name, role, onLogout }: AdminSidebarProps) {
  const pathname = usePathname();
  const navigation = [
    { href: "/admin", label: "Beranda", icon: <HomeIcon /> },
    { href: "/admin/prospects", label: "Prospek", icon: <ProspectIcon /> },
    { href: "/admin/content", label: "Konten landing", icon: <ContentIcon /> },
    ...(role === "admin" ? [{ href: "/admin/insights", label: "Laporan pengunjung", icon: <InsightIcon /> }] : []),
  ];

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
          <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="admin-sidebar-bottom">
        <Link className="admin-public-link" href="/" target="_blank" rel="noreferrer">
          <ExternalIcon />
          Lihat landing page
        </Link>
        <Link className="admin-account" href="/admin/profile">
          <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{name}</strong>
            <small>{role === "admin" ? "Administrator" : role === "content" ? "Editor konten" : "Sales"}</small>
          </div>
        </Link>
        <form action={onLogout}>
          <button type="submit">Keluar</button>
        </form>
      </div>
      <nav className="admin-bottom-nav" aria-label="Navigasi mobile">
        {navigation.map((item) => (
          <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
            {item.icon}
            <span>{item.label.replace(" landing", "")}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
