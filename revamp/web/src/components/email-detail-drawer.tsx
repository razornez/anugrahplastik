"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function EmailDetailDrawer({
  children,
  closeHref,
  label = "Detail email",
}: Readonly<{
  children: React.ReactNode;
  closeHref: string;
  label?: string;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const media = window.matchMedia("(max-width: 767px)");
    const presentForViewport = () => {
      const mobile = media.matches;
      setIsMobile(mobile);
      if (dialog.open) dialog.close();
      if (mobile) {
        dialog.showModal();
        requestAnimationFrame(() => closeButtonRef.current?.focus());
      } else dialog.show();
    };
    presentForViewport();
    const close = (event: Event) => {
      event.preventDefault();
      router.push(closeHref);
    };
    media.addEventListener("change", presentForViewport);
    dialog.addEventListener("cancel", close);
    return () => {
      media.removeEventListener("change", presentForViewport);
      dialog.removeEventListener("cancel", close);
      if (dialog.open) dialog.close();
    };
  }, [closeHref, router]);

  return (
    <dialog
      aria-labelledby={titleId}
      aria-modal={isMobile || undefined}
      className="email-detail-drawer"
      ref={dialogRef}
    >
      <div className="email-detail-drawer__bar" aria-hidden="true" />
      <header className="email-detail-drawer__header">
        <strong id={titleId}>{label}</strong>
        <button
          aria-label="Tutup detail email"
          className="email-detail-drawer__close"
          onClick={() => router.push(closeHref)}
          ref={closeButtonRef}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
          <span>Tutup</span>
        </button>
      </header>
      <div className="email-detail-drawer__content">{children}</div>
    </dialog>
  );
}
