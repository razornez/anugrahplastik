"use client";

import { useState } from "react";
import { RichEmailEditor } from "@/components/rich-email-editor";
import { previewOutgoingEmail } from "@/features/integrations/email-template-actions";
import type { EmailNode } from "@/features/integrations/email-templates";

export function EmailMessageComposer({ initial }: { initial: EmailNode }) {
  const [value, setValue] = useState(initial);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  async function showPreview() {
    try {
      setError("");
      setPreview(await previewOutgoingEmail(value));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pratinjau gagal.");
    }
  }
  return (
    <div className="email-message-composer">
      <RichEmailEditor
        name="bodyJson"
        initial={initial}
        onChange={(next) => {
          setValue(next);
          setPreview("");
        }}
      />
      <button className="admin-secondary-button" type="button" onClick={() => void showPreview()}>
        Pratinjau email
      </button>
      {error ? (
        <p role="alert" className="integration-alert">
          {error}
        </p>
      ) : null}
      {preview ? (
        <iframe
          title="Pratinjau email sebelum dikirim"
          sandbox=""
          srcDoc={preview}
          className="email-template-preview__frame"
        />
      ) : null}
    </div>
  );
}
