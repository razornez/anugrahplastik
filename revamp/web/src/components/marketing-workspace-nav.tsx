"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const sections = [
  { href: "/admin/growth", label: "Ringkasan" },
  { href: "/admin/prospects", label: "Prospek" },
  { href: "/admin/marketing", label: "Iklan Google" },
  { href: "/admin/insights", label: "Pengunjung" },
] as const;

export function MarketingWorkspaceNav({
  current,
  role = "admin",
}: {
  current: (typeof sections)[number]["href"];
  role?: "admin" | "sales" | "content";
}) {
  const router = useRouter();
  const visible =
    role === "content"
      ? sections.filter((section) => section.href === "/admin/growth" || section.href === "/admin/prospects")
      : sections;
  return (
    <>
      <nav className="marketing-workspace-nav" aria-label="Bagian ruang kerja pemasaran">
        {visible.map((section) => (
          <Link key={section.href} href={section.href} aria-current={current === section.href ? "page" : undefined}>
            {section.label}
          </Link>
        ))}
      </nav>
      <label className="marketing-workspace-picker">
        Bagian pemasaran
        <select value={current} onChange={(event) => router.push(event.target.value)}>
          {visible.map((section) => (
            <option key={section.href} value={section.href}>
              {section.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
