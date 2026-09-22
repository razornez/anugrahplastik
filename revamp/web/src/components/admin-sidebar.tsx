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
    { href: "/admin/content", label: "Konten landing", icon: <ContentIcon /> },
    ...(role === "admin" ? [{ href: "/admin/insights", label: "Insight pengunjung", icon: <InsightIcon /> }] : []),
  ];

  return (
    <aside className="admin-sidebar">
      <Link className="admin-brand" href="/admin/content" aria-label="Anugrah Plastik back office">
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
        <div className="admin-account">
          <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{name}</strong>
            <small>{role === "admin" ? "Administrator" : role === "content" ? "Editor konten" : "Sales"}</small>
          </div>
        </div>
        <form action={onLogout}>
          <button type="submit">Keluar</button>
        </form>
      </div>
    </aside>
  );
}
