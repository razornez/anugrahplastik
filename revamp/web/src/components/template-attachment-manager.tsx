"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  removeEmailTemplateAttachment,
  uploadEmailTemplateAttachment,
} from "@/features/integrations/email-template-actions";

const maxAttachmentBytes = 15 * 1024 * 1024;

function formatMegabytes(bytes: number) {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}

function scanLabel(status: string) {
  if (status === "clean") return "Bersih";
  if (status === "malware") return "Berbahaya · tidak dapat dikirim";
  if (status === "unavailable") return "Belum dipindai · perlu konfirmasi saat kirim";
  if (status === "pending") return "Menunggu pemindaian";
  return "Pemindaian perlu diperiksa";
}

export function TemplateAttachmentManager({
  templateId,
  attachments,
}: {
  templateId: string;
  attachments: Array<{ id: string; filename: string; size: number; scanStatus: string }>;
}) {
  const router = useRouter();
  const [state, setState] = useState<{ error?: string; message?: string }>({});
  const [pending, setPending] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number } | null>(null);
  const selectedError =
    selectedFile && selectedFile.size + attachments.reduce((sum, item) => sum + item.size, 0) > maxAttachmentBytes
      ? "Total lampiran tetap melebihi 15 MB. Lepas file lain atau pilih file yang lebih kecil."
      : null;
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState({});
    try {
      const result = await uploadEmailTemplateAttachment({}, new FormData(event.currentTarget));
      setState(result.error ? { error: result.error } : { message: "Lampiran tetap sudah ditambahkan." });
      if (result.ok) {
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } catch {
      setState({ error: "Lampiran belum dapat diunggah. Periksa koneksi lalu coba lagi." });
    } finally {
      setPending(false);
    }
  }
  async function remove(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setRemovingId(id);
    setState({});
    try {
      await removeEmailTemplateAttachment(new FormData(event.currentTarget));
      setState({ message: "Lampiran dilepas dari template." });
      router.refresh();
    } catch {
      setState({ error: "Lampiran belum dapat dilepas. Coba lagi." });
    } finally {
      setRemovingId(null);
    }
  }
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
                  {formatMegabytes(attachment.size)} · {scanLabel(attachment.scanStatus)}
                </small>
              </span>
              <form onSubmit={(event) => remove(event, attachment.id)}>
                <input name="attachmentId" type="hidden" value={attachment.id} />
                <button
                  aria-label={`Lepas ${attachment.filename}`}
                  className="admin-button admin-button--ghost"
                  disabled={removingId === attachment.id}
                  type="submit"
                >
                  {removingId === attachment.id ? "Melepas…" : "Lepas"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-empty-copy">Belum ada lampiran tetap.</p>
      )}
      <form className="email-template-attachments__upload" onSubmit={upload}>
        <input name="templateId" type="hidden" value={templateId} />
        <div className="email-template-attachments__picker">
          <label className="email-template-attachments__choose" htmlFor={fileId}>
            Pilih file
          </label>
          <input
            id={fileId}
            name="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setSelectedFile(file ? { name: file.name, size: file.size } : null);
            }}
            ref={fileRef}
            required
            type="file"
          />
          <span aria-live="polite" className="email-template-attachments__filename">
            {selectedFile ? `${selectedFile.name} · ${formatMegabytes(selectedFile.size)}` : "Belum ada file dipilih"}
          </span>
        </div>
        {selectedError ? (
          <p className="email-template-attachments__error" role="alert">
            {selectedError}
          </p>
        ) : null}
        <button
          aria-busy={pending}
          className="admin-primary-button"
          disabled={pending || !selectedFile || Boolean(selectedError) || attachments.length >= 4}
          type="submit"
        >
          {pending ? "Mengunggah…" : "Unggah"}
        </button>
      </form>
      {state.error ? (
        <p className="integration-alert" role="alert">
          {state.error}
        </p>
      ) : state.message ? (
        <p className="admin-notice" role="status">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
