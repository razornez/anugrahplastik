"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { ReactNode } from "react";

const scrollStorageKey = "ap:transaction-list-scroll-v1";

export function TransactionResultLink({
  href,
  returnTo,
  children,
  className,
}: {
  href: string;
  returnTo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      className={className}
      href={href}
      onClick={() => {
        try {
          sessionStorage.setItem(scrollStorageKey, JSON.stringify({ url: returnTo, y: window.scrollY }));
        } catch {
          // Navigation should continue if browser storage is unavailable.
        }
      }}
    >
      {children}
    </Link>
  );
}

export function TransactionListScrollRestorer({ listUrl }: { listUrl: string }) {
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(scrollStorageKey);
      if (!stored) return;
      sessionStorage.removeItem(scrollStorageKey);
      const position = JSON.parse(stored) as { url?: string; y?: number };
      if (position.url === listUrl && typeof position.y === "number") {
        requestAnimationFrame(() => {
          window.scrollTo({ top: position.y, behavior: "instant" });
        });
      }
    } catch {
      // Storage restrictions must not prevent rendering or navigation.
    }
  }, [listUrl]);
  return null;
}
