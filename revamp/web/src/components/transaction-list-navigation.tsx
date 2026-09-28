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
          const list = document.querySelector<HTMLElement>(".transaction-list");
          sessionStorage.setItem(
            scrollStorageKey,
            JSON.stringify({ url: returnTo, y: window.scrollY, listY: list?.scrollTop ?? 0 }),
          );
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
    const stored = sessionStorage.getItem(scrollStorageKey);
    if (!stored) return;
    sessionStorage.removeItem(scrollStorageKey);
    try {
      const position = JSON.parse(stored) as { url?: string; y?: number; listY?: number };
      if (position.url === listUrl && typeof position.y === "number") {
        requestAnimationFrame(() => {
          window.scrollTo({ top: position.y, behavior: "instant" });
          const list = document.querySelector<HTMLElement>(".transaction-list");
          if (list && typeof position.listY === "number") list.scrollTop = position.listY;
        });
      }
    } catch {
      sessionStorage.removeItem(scrollStorageKey);
    }
  }, [listUrl]);
  return null;
}
