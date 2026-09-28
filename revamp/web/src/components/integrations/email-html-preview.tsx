"use client";

import { useState } from "react";
import { emailPreviewDocument } from "@/features/integrations/email-preview-document";

export function EmailHtmlPreview({ html }: { html: string }) {
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const srcDoc = emailPreviewDocument(html, allowRemoteImages);

  return (
    <section className="email-html-preview" aria-label="Isi email berformat HTML">
      <div className="email-html-preview__toolbar">
        <p>Gambar dari luar diblokir untuk mencegah pelacakan. Pengirim dapat mengetahui saat gambar dimuat.</p>
        <button type="button" onClick={() => setAllowRemoteImages((allowed) => !allowed)}>
          {allowRemoteImages ? "Blokir gambar luar" : "Tampilkan gambar"}
        </button>
      </div>
      <iframe
        className="email-html-preview__frame"
        title="Pratinjau isi email"
        sandbox=""
        referrerPolicy="no-referrer"
        loading="lazy"
        srcDoc={srcDoc}
      />
    </section>
  );
}
