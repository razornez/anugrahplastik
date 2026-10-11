"use client";

import { useEffect, useId, useRef, useState } from "react";
import { emailPreviewDocument } from "@/features/integrations/email-preview-document";

export function EmailHtmlPreview({ html }: { html: string }) {
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const [previewHeight, setPreviewHeight] = useState<number>();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const privacyNoticeId = useId();
  const srcDoc = emailPreviewDocument(html, allowRemoteImages);

  useEffect(() => {
    return () => resizeObserverRef.current?.disconnect();
  }, []);

  function resizePreview() {
    const document = frameRef.current?.contentDocument;
    if (!document) return;
    const contentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    setPreviewHeight(Math.min(Math.max(contentHeight + 2, 300), 960));
  }

  function handlePreviewLoad() {
    resizeObserverRef.current?.disconnect();
    resizePreview();
    const document = frameRef.current?.contentDocument;
    if (!document || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resizePreview);
    observer.observe(document.body);
    resizeObserverRef.current = observer;
  }

  return (
    <section className="email-html-preview" aria-label="Isi email berformat HTML">
      <div className="email-html-preview__toolbar">
        <p id={privacyNoticeId} className="email-html-preview__privacy-state">
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M12 3 5 6v5c0 4.7 2.8 8.4 7 10 4.2-1.6 7-5.3 7-10V6l-7-3Z" />
            <path d="m9.5 12 1.6 1.6 3.6-3.8" />
          </svg>
          <span>
            <strong>{allowRemoteImages ? "Gambar luar dimuat" : "Gambar luar diblokir"}</strong>
            <span className="sr-only">
              {allowRemoteImages
                ? " Gambar hanya dimuat untuk email ini."
                : " untuk mencegah pelacakan. Pengirim dapat mengetahui saat gambar dimuat."}
            </span>
          </span>
        </p>
        <button
          type="button"
          aria-pressed={allowRemoteImages}
          aria-describedby={privacyNoticeId}
          onClick={() => setAllowRemoteImages((allowed) => !allowed)}
        >
          {allowRemoteImages ? "Blokir lagi" : "Muat gambar"}
        </button>
      </div>
      <iframe
        className="email-html-preview__frame"
        title="Pratinjau isi email"
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={handlePreviewLoad}
        ref={frameRef}
        srcDoc={srcDoc}
        style={previewHeight ? { height: `${previewHeight}px` } : undefined}
      />
    </section>
  );
}
