"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

function TransactionIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5.25 3.75h10.5l3 3v13.5H5.25A1.5 1.5 0 0 1 3.75 18.75v-13.5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M15.75 3.75v3h3M7.5 11.25h9M7.5 15h6" />
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

export function AdminSidebar({ name, role, onLogout }: AdminSidebarProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const navigation = [
    { href: "/admin", label: "Beranda", icon: <HomeIcon /> },
    { href: "/admin/prospects", label: "Prospek", icon: <ProspectIcon /> },
    ...(role === "admin" || role === "sales"
      ? [{ href: "/admin/transactions", label: "Transaksi", icon: <TransactionIcon /> }]
      : []),
    { href: "/admin/content", label: "Konten landing", icon: <ContentIcon /> },
    ...(role === "admin" || role === "sales"
      ? [{ href: "/admin/insights", label: "Laporan pengunjung", icon: <InsightIcon /> }]
      : []),
    ...(role === "admin" ? [{ href: "/admin/masters", label: "Data master", icon: <MasterIcon /> }] : []),
  ];
  const mobileNavigation = navigation.filter((item) => !["/admin/masters", "/admin/insights"].includes(item.href));
  const moreNavigation = navigation.filter((item) => ["/admin/masters", "/admin/insights"].includes(item.href));

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMoreOpen(false);
      moreButton.current?.focus();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

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
            aria-current={pathname === item.href ? "page" : undefined}
            aria-label={item.label}
            title={item.label}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="admin-sidebar-bottom">
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
          <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
            {item.icon}
            <span>{item.label.replace(" landing", "")}</span>
          </Link>
        ))}
        <button
          aria-controls="admin-more-sheet"
          aria-expanded={moreOpen}
          className={moreOpen ? "is-active" : undefined}
          onClick={() => setMoreOpen((open) => !open)}
          ref={moreButton}
          type="button"
        >
          <MoreIcon />
          <span>Lainnya</span>
        </button>
      </nav>
      {moreOpen ? (
        <div className="admin-more-backdrop" onMouseDown={() => setMoreOpen(false)}>
          <section
            aria-label="Menu lainnya"
            className="admin-more-sheet"
            id="admin-more-sheet"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="admin-more-sheet__head">
              <strong>Menu lainnya</strong>
              <button aria-label="Tutup menu lainnya" onClick={() => setMoreOpen(false)} type="button">
                ×
              </button>
            </div>
            <nav>
              {moreNavigation.map((item) => (
                <Link href={item.href} key={item.href} onClick={() => setMoreOpen(false)}>
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
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
          </section>
        </div>
      ) : null}
    </aside>
  );
}
