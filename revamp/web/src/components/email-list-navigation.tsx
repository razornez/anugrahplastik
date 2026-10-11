"use client";
import Link from "next/link";
import { useEffect, type ComponentProps } from "react";
import { emailSelectionLoadingEvent } from "@/components/email-selection-loading";
const storageKey = "ap:email-list-position-v1";

export function EmailResultLink({ returnTo, onClick, ...props }: ComponentProps<typeof Link> & { returnTo: string }) {
  return (
    <Link
      {...props}
      prefetch={false}
      scroll={false}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;

        if (
          props["aria-current"] !== "true" &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        )
          window.dispatchEvent(new Event(emailSelectionLoadingEvent));

        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ url: returnTo, y: window.scrollY }));
        } catch {
          /* Storage must not block navigation. */
        }
      }}
    />
  );
}
export function EmailListScrollRestorer({ listUrl }: { listUrl: string }) {
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return;
      const position = JSON.parse(stored) as { url?: string; y?: number };
      if (position.url === listUrl && Number.isFinite(position.y)) {
        sessionStorage.removeItem(storageKey);
        requestAnimationFrame(() => window.scrollTo({ top: position.y, behavior: "instant" }));
      }
    } catch {
      /* Storage must not block navigation. */
    }
  }, [listUrl]);
  return null;
}
