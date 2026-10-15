"use client";

import * as Dialog from "@radix-ui/react-dialog";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminDialogPortalFrame } from "@/components/admin-dialog-portal-frame";
import {
  createTransactionEmailDraft,
  confirmEmailDraft,
  prepareEmailDraft,
} from "@/features/integrations/email-workspace-actions";
import type { EmailNode } from "@/features/integrations/email-templates";

const RichEmailEditor = dynamic(
  () => import("@/components/rich-email-editor").then((module) => module.RichEmailEditor),
  { loading: () => <div className="transaction-email-editor-loading" aria-label="Memuat editor" /> },
);

type TemplateOption = {
  id: string;
  name: string;
  language: string;
  isDefault: boolean;
  version: number;
  subject: string;
  content: EmailNode;
};

type Preview =
  Awaited<ReturnType<typeof prepareEmailDraft>> extends { ok: true }
    ? never
    : {
        attemptId: string;
        simulation: boolean;
        html: string;
        text: string;
        recipients: { to: string[]; cc: string[]; bcc: string[] };
        from: string;
        subject: string;
        files: { filename: string; size: number }[];
        documentInfo?: { number: string | null; type: string; version: number };
      };

function templateText(node: EmailNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const value = (node.content ?? []).map(templateText).join("");
  return ["paragraph", "heading", "listItem"].includes(node.type) ? `${value}\n` : value;
}

export function TransactionEmailComposer({
  transactionId,
  documentId,
  documentLabel,
  contacts,
  templates,
  ownerName,
  requiresPicConfirmation,
  lastSend,
}: {
  transactionId: string;
  documentId: string;
  documentLabel: string;
  contacts: Array<{ id: string; name: string; email: string; isPrimary: boolean }>;
  templates: TemplateOption[];
  ownerName?: string | null;
  requiresPicConfirmation: boolean;
  lastSend?: { recipient?: string | null; at?: string | null; by?: string | null };
}) {
  const router = useRouter();
  const initialTemplate = templates.find((item) => item.language === "id" && item.isDefault) ?? templates[0];
  const primary = contacts.find((item) => item.isPrimary)?.email ?? contacts[0]?.email ?? "";
  const [open, setOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(initialTemplate?.id ?? "");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogPreviewId, setCatalogPreviewId] = useState(initialTemplate?.id ?? "");
  const selected = useMemo(
    () => templates.find((item) => item.id === selectedId) ?? initialTemplate,
    [initialTemplate, selectedId, templates],
  );
  const catalogPreview = templates.find((item) => item.id === catalogPreviewId) ?? selected;
  const [to, setTo] = useState(primary);
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(initialTemplate?.subject ?? "");
  const [content, setContent] = useState<EmailNode>(
    initialTemplate?.content ?? { type: "doc", content: [{ type: "paragraph" }] },
  );
  const [editorKey, setEditorKey] = useState(initialTemplate?.id ?? "initial");
  const [saveContacts, setSaveContacts] = useState(false);
  const [confirmOtherPic, setConfirmOtherPic] = useState(false);
  const [allowUnscanned, setAllowUnscanned] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function requestClose() {
    if (pending) return;
    if (dirty && !sent) setDiscardOpen(true);
    else setOpen(false);
  }

  function applyTemplate(id: string) {
    const next = templates.find((item) => item.id === id);
    if (!next) return;
    setSelectedId(next.id);
    setSubject(next.subject);
    setContent(next.content);
    setEditorKey(`${next.id}-${Date.now()}`);
    setDirty(false);
    setPreview(null);
    setCatalogOpen(false);
  }

  function chooseTemplate(id: string) {
    if (id === selectedId) return;
    if (dirty) {
      setPendingTemplateId(id);
      return;
    }
    applyTemplate(id);
  }

  function prepare() {
    if (!selected) return;
    setError("");
    startTransition(async () => {
      try {
        const draft = await createTransactionEmailDraft({
          transactionId,
          documentId,
          templateId: selected.id,
          language: selected.language,
          to,
          cc,
          subject,
          content,
          saveContacts,
          confirmOtherPic,
        });
        const result = await prepareEmailDraft(draft.id, draft.revision, allowUnscanned);
        if (!result.ok) throw new Error(result.error);
        setPreview(result as Preview);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Pratinjau belum dapat dibuat.");
      }
    });
  }

  function send() {
    if (!preview) return;
    setError("");
    startTransition(async () => {
      const result = await confirmEmailDraft(preview.attemptId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
      setDirty(false);
      setOpen(false);
      router.refresh();
    });
  }

  if (!initialTemplate) return <span className="transaction-email-unavailable">Template belum tersedia</span>;

  return (
    <>
      <button className="transaction-email-trigger" onClick={() => setOpen(true)} type="button">
        {lastSend ? "Kirim ulang" : "Kirim email"}
      </button>
      {sent ? (
        <p className="transaction-email-success" role="status">
          Sudah dikirim. <Link href="/admin/email?folder=sent">Lihat di Email CS</Link>
        </p>
      ) : null}
      <Dialog.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : requestClose())}>
        <Dialog.Portal>
          <AdminDialogPortalFrame>
            <Dialog.Overlay className="transaction-email-overlay" />
            <Dialog.Content className="transaction-email-sheet" aria-describedby="transaction-email-description">
              <header>
                <div>
                  <p className="eyebrow">{documentLabel}</p>
                  <Dialog.Title>Kirim email</Dialog.Title>
                  <Dialog.Description id="transaction-email-description">
                    Periksa penerima, isi, dan dokumen sebelum dikirim.
                  </Dialog.Description>
                </div>
                <button aria-label="Tutup composer" onClick={requestClose} type="button">
                  ×
                </button>
              </header>
              <div className="transaction-email-segments" role="tablist" aria-label="Tampilan composer">
                <button
                  aria-selected={!preview && !catalogOpen}
                  onClick={() => {
                    setCatalogOpen(false);
                    setPreview(null);
                  }}
                  role="tab"
                  type="button"
                >
                  Edit
                </button>
                <button aria-selected={Boolean(preview)} disabled={!preview} role="tab" type="button">
                  Preview
                </button>
              </div>
              {catalogOpen ? (
                <div className="transaction-email-template-catalog">
                  <header>
                    <button onClick={() => setCatalogOpen(false)} type="button">
                      ← Kembali
                    </button>
                    <div>
                      <strong>Pilih template</strong>
                      <small>Bahasa Indonesia diprioritaskan.</small>
                    </div>
                  </header>
                  <div className="transaction-email-template-layout">
                    <div className="transaction-email-template-list" role="listbox" aria-label="Template email">
                      {templates.map((template) => (
                        <button
                          aria-selected={catalogPreview?.id === template.id}
                          key={template.id}
                          onClick={() => setCatalogPreviewId(template.id)}
                          role="option"
                          type="button"
                        >
                          <strong>{template.name}</strong>
                          <span>
                            {template.language === "id" ? "Bahasa Indonesia" : template.language}
                            {template.isDefault ? " · Default" : ""}
                          </span>
                          <small>Versi {template.version}</small>
                        </button>
                      ))}
                    </div>
                    {catalogPreview ? (
                      <section className="transaction-email-template-preview" aria-label="Preview template terpilih">
                        <p className="eyebrow">PREVIEW TEMPLATE</p>
                        <h3>{catalogPreview.subject || "Tanpa subjek"}</h3>
                        <p>{templateText(catalogPreview.content).trim() || "Isi template kosong."}</p>
                        <button
                          className="admin-primary-button"
                          onClick={() => chooseTemplate(catalogPreview.id)}
                          type="button"
                        >
                          Gunakan template ini
                        </button>
                      </section>
                    ) : null}
                  </div>
                </div>
              ) : !preview ? (
                <div className="transaction-email-editor">
                  {lastSend ? (
                    <p className="transaction-email-resend" role="status">
                      Dokumen ini pernah dikirim
                      {lastSend.at
                        ? ` pada ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(lastSend.at))} WIB`
                        : ""}
                      {lastSend.by ? ` oleh ${lastSend.by}` : ""}
                      {lastSend.recipient ? ` ke ${lastSend.recipient}` : ""}. Periksa penerima sebelum mengirim ulang.
                    </p>
                  ) : null}
                  <div className="transaction-email-template-field">
                    <span>Template</span>
                    <button
                      onClick={() => {
                        setCatalogPreviewId(selectedId);
                        setCatalogOpen(true);
                      }}
                      type="button"
                    >
                      <span>
                        <strong>{selected.name}</strong>
                        <small>
                          {selected.language === "id" ? "Bahasa Indonesia" : selected.language} · versi{" "}
                          {selected.version}
                        </small>
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  </div>
                  <label>
                    Penerima
                    <input
                      list={`contacts-${documentId}`}
                      onChange={(event) => {
                        setTo(event.target.value);
                        setDirty(true);
                      }}
                      placeholder="nama@perusahaan.com"
                      value={to}
                    />
                  </label>
                  <datalist id={`contacts-${documentId}`}>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.email}>
                        {contact.name}
                      </option>
                    ))}
                  </datalist>
                  <button
                    className="transaction-email-disclosure"
                    onClick={() => setShowCc((value) => !value)}
                    type="button"
                  >
                    {showCc ? "Sembunyikan CC" : "Tambahkan CC"}
                  </button>
                  {showCc ? (
                    <label>
                      CC
                      <input
                        onChange={(event) => {
                          setCc(event.target.value);
                          setDirty(true);
                        }}
                        placeholder="Pisahkan dengan koma"
                        value={cc}
                      />
                    </label>
                  ) : null}
                  <label>
                    Subjek
                    <input
                      onChange={(event) => {
                        setSubject(event.target.value);
                        setDirty(true);
                      }}
                      value={subject}
                    />
                  </label>
                  <div className="transaction-email-body">
                    <strong>Isi email</strong>
                    <RichEmailEditor
                      key={editorKey}
                      initial={content}
                      onChange={(next) => {
                        setContent(next);
                        setDirty(true);
                      }}
                    />
                  </div>
                  <label className="transaction-email-check">
                    <input
                      checked={saveContacts}
                      onChange={(event) => setSaveContacts(event.target.checked)}
                      type="checkbox"
                    />{" "}
                    Simpan alamat baru sebagai kontak pelanggan
                  </label>
                  {requiresPicConfirmation ? (
                    <label className="transaction-email-check transaction-email-warning">
                      <input
                        checked={confirmOtherPic}
                        onChange={(event) => setConfirmOtherPic(event.target.checked)}
                        required
                        type="checkbox"
                      />{" "}
                      Transaksi ini milik {ownerName || "PIC lain"}. Saya telah memeriksa pengiriman.
                    </label>
                  ) : null}
                  <label className="transaction-email-check transaction-email-scan-bypass">
                    <input
                      checked={allowUnscanned}
                      onChange={(event) => setAllowUnscanned(event.target.checked)}
                      type="checkbox"
                    />{" "}
                    Izinkan pengiriman bila scanner lampiran sedang tidak tersedia
                  </label>
                  {error ? (
                    <p className="integration-alert" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="transaction-email-preview">
                  {lastSend ? (
                    <p className="transaction-email-resend">Ini pengiriman ulang dokumen yang sama.</p>
                  ) : null}
                  <dl>
                    <dt>Dari</dt>
                    <dd>{preview.from}</dd>
                    <dt>Penerima</dt>
                    <dd>{preview.recipients.to.join(", ")}</dd>
                    <dt>CC</dt>
                    <dd>{preview.recipients.cc.join(", ") || "—"}</dd>
                    <dt>Template</dt>
                    <dd>
                      {selected.name} · v{selected.version}
                    </dd>
                    <dt>Subjek</dt>
                    <dd>{preview.subject}</dd>
                  </dl>
                  <div className="transaction-email-files">
                    {preview.files.map((file) => (
                      <div key={file.filename}>
                        <span>{file.filename}</span>
                        <small>
                          {new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(file.size / 1024 / 1024)}{" "}
                          MB
                        </small>
                      </div>
                    ))}
                  </div>
                  <iframe referrerPolicy="no-referrer" sandbox="" srcDoc={preview.html} title="Pratinjau email final" />
                  <p className="transaction-email-helper">
                    Sistem akan mengirim pesan ke server email, tetapi tidak dapat menjamin pesan masuk ke inbox
                    penerima.
                  </p>
                  {allowUnscanned ? (
                    <p className="transaction-email-warning" role="alert">
                      File yang belum dipindai akan tetap dikirim atas konfirmasi Anda.
                    </p>
                  ) : null}
                  {error ? (
                    <p className="integration-alert" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
              )}
              {!catalogOpen ? (
                <footer className="transaction-email-actionbar">
                  {preview ? (
                    <>
                      <button disabled={pending} onClick={() => setPreview(null)} type="button">
                        Kembali mengedit
                      </button>
                      <button
                        aria-busy={pending}
                        className="admin-primary-button"
                        disabled={pending}
                        onClick={send}
                        type="button"
                      >
                        {pending ? "Mengirim…" : preview.simulation ? "Jalankan simulasi" : "Kirim sekarang"}
                      </button>
                    </>
                  ) : (
                    <button
                      aria-busy={pending}
                      className="admin-primary-button"
                      disabled={pending || !to || !subject || (requiresPicConfirmation && !confirmOtherPic)}
                      onClick={prepare}
                      type="button"
                    >
                      {pending ? "Menyiapkan…" : "Periksa sebelum kirim"}
                    </button>
                  )}
                </footer>
              ) : null}
            </Dialog.Content>
          </AdminDialogPortalFrame>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={discardOpen} onOpenChange={setDiscardOpen}>
        <Dialog.Portal>
          <AdminDialogPortalFrame>
            <Dialog.Overlay className="transaction-email-overlay" />
            <Dialog.Content className="transaction-email-discard" aria-describedby="discard-email-description">
              <Dialog.Title>Buang perubahan email?</Dialog.Title>
              <Dialog.Description id="discard-email-description">
                Subjek, penerima, dan isi yang belum dikirim akan hilang.
              </Dialog.Description>
              <div>
                <Dialog.Close asChild>
                  <button type="button">Lanjut mengedit</button>
                </Dialog.Close>
                <button
                  onClick={() => {
                    setDirty(false);
                    setDiscardOpen(false);
                    setOpen(false);
                  }}
                  type="button"
                >
                  Buang draft
                </button>
              </div>
            </Dialog.Content>
          </AdminDialogPortalFrame>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={Boolean(pendingTemplateId)}
        onOpenChange={(next) => {
          if (!next) setPendingTemplateId(null);
        }}
      >
        <Dialog.Portal>
          <AdminDialogPortalFrame>
            <Dialog.Overlay className="transaction-email-overlay transaction-email-overlay--confirm" />
            <Dialog.Content className="transaction-email-discard" aria-describedby="change-template-description">
              <Dialog.Title>Ganti template?</Dialog.Title>
              <Dialog.Description id="change-template-description">
                Subjek dan isi yang telah diedit akan diganti dengan template baru.
              </Dialog.Description>
              <div>
                <Dialog.Close asChild>
                  <button type="button">Tetap gunakan ini</button>
                </Dialog.Close>
                <button
                  className="admin-primary-button"
                  onClick={() => {
                    if (pendingTemplateId) applyTemplate(pendingTemplateId);
                    setPendingTemplateId(null);
                  }}
                  type="button"
                >
                  Ganti template
                </button>
              </div>
            </Dialog.Content>
          </AdminDialogPortalFrame>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
