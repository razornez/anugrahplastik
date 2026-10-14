"use client";

import { useActionState } from "react";
import {
  removeEmailTemplateAttachment,
  uploadEmailTemplateAttachment,
  type TemplateAttachmentState,
} from "@/features/integrations/email-template-actions";

const initialState: TemplateAttachmentState = {};

export function TemplateAttachmentManager({
  templateId,
  attachments,
}: {
  templateId: string;
  attachments: Array<{ id: string; filename: string; size: number; scanStatus: string }>;
}) {
  const [state, action, pending] = useActionState(uploadEmailTemplateAttachment, initialState);
  return (
    <section className="email-template-attachments" aria-labelledby="template-attachments-heading">
      <div>
        <h2 id="template-attachments-heading">Lampiran tetap</h2>
        <p>Ikut pada setiap email template ini. Maksimal empat file dan total 15 MB.</p>
      </div>
      {attachments.length ? (
        <ul>
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <span>
                <strong>{attachment.filename}</strong>
                <small>
                  {new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(attachment.size / 1024 / 1024)}{" "}
                  MB · {attachment.scanStatus === "clean" ? "Bersih" : "Belum dipindai"}
                </small>
              </span>
              <form action={removeEmailTemplateAttachment}>
                <input name="attachmentId" type="hidden" value={attachment.id} />
                <button type="submit">Lepas</button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-empty-copy">Belum ada lampiran tetap.</p>
      )}
      <form action={action}>
        <input name="templateId" type="hidden" value={templateId} />
        <label>
          Tambah file
          <input name="file" required type="file" />
        </label>
        <button aria-busy={pending} disabled={pending} type="submit">
          {pending ? "Mengunggah…" : "Unggah"}
        </button>
      </form>
      {state.error ? (
        <p className="integration-alert" role="alert">
          {state.error}
        </p>
      ) : state.ok ? (
        <p className="admin-notice" role="status">
          Lampiran tetap sudah ditambahkan.
        </p>
      ) : null}
    </section>
  );
}
