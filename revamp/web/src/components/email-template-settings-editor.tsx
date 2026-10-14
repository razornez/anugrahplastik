"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { RichEmailEditor } from "@/components/rich-email-editor";
import {
  previewEmailTemplate,
  saveEmailTemplate,
  sendEmailTemplateTest,
} from "@/features/integrations/email-template-actions";
import type { EmailNode, TemplateKey } from "@/features/integrations/email-templates";
import {
  defaultEmailShellConfig,
  emailShellAccents,
  type EmailShellConfig,
} from "@/features/integrations/email-template-shell";
import { emailVariableLabels } from "./email-variable-labels";

type PreviewState = "idle" | "pending" | "ready" | "error";

function subjectError(value: string, key: TemplateKey, variables: readonly string[]) {
  const subject = value.trim();
  if (key !== "layout" && !subject) return "Subjek email wajib diisi.";
  if (/[\r\n]/.test(subject)) return "Subjek tidak boleh berisi baris baru.";
  if (/{{|}}/.test(subject.replace(/{{([^{}]+)}}/g, ""))) return "Penulisan variabel di subjek belum lengkap.";
  if ([...subject.matchAll(/{{([^{}]+)}}/g)].some((match) => !variables.includes(match[1])))
    return "Subjek memakai variabel yang tidak tersedia untuk jenis template ini.";
  return "";
}

function shellError(value: EmailShellConfig) {
  if (value.companyName.trim().length < 2) return "Nama perusahaan pada kop email wajib diisi.";
  if (value.tagline.trim().length < 2) return "Tagline pada kop email wajib diisi.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contactEmail)) return "Email kontak pada footer belum valid.";
  if (value.footerText.trim().length < 2) return "Teks footer email wajib diisi.";
  return "";
}

export function EmailTemplateSettingsEditor({
  templateId,
  keyName,
  subject,
  initial,
  shellConfig = defaultEmailShellConfig,
}: {
  templateId?: string | null;
  keyName: TemplateKey;
  subject: string;
  initial: EmailNode;
  shellConfig?: EmailShellConfig;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const previewRequest = useRef(0);
  const [content, setContent] = useState(initial);
  const [subjectValue, setSubjectValue] = useState(subject);
  const [savedSubject, setSavedSubject] = useState(subject);
  const [savedContent, setSavedContent] = useState(() => JSON.stringify(initial));
  const [shell, setShell] = useState<EmailShellConfig>(shellConfig);
  const [savedShell, setSavedShell] = useState(() => JSON.stringify(shellConfig));
  const [preview, setPreview] = useState("");
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [previewError, setPreviewError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [testPending, setTestPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const draftKey = `email-template-draft:v1:${templateId ?? keyName}`;
  const variables =
    keyName === "layout"
      ? ["message", "senderName"]
      : keyName === "new"
        ? ["senderName"]
        : keyName === "reply"
          ? ["originalSubject", "senderName"]
          : ["customerName", "transactionNo", "documentName", "senderName"];
  const subjectVariables = keyName === "layout" ? [] : variables.filter((variable) => variable !== "message");
  const currentContent = useMemo(() => JSON.stringify(content), [content]);
  const currentShell = useMemo(() => JSON.stringify(shell), [shell]);
  const isLayout = keyName === "layout";
  const hasChanges =
    subjectValue !== savedSubject || currentContent !== savedContent || (isLayout && currentShell !== savedShell);
  const currentSubjectError = subjectError(subjectValue, keyName, variables);
  const currentShellError = isLayout ? shellError(shell) : "";
  const currentError = currentSubjectError || currentShellError || previewError;
  const canActivate = hasChanges && previewState === "ready" && !currentError && !pending;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = window.sessionStorage.getItem(draftKey);
        if (!stored) return;
        const draft = JSON.parse(stored) as { subject?: unknown; content?: unknown; shell?: unknown };
        if (typeof draft.subject === "string") setSubjectValue(draft.subject);
        if (draft.content && typeof draft.content === "object") {
          setContent(draft.content as EmailNode);
          setEditorEpoch((value) => value + 1);
        }
        if (isLayout && draft.shell && typeof draft.shell === "object") setShell(draft.shell as EmailShellConfig);
      } catch {
        window.sessionStorage.removeItem(draftKey);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [draftKey, isLayout]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (hasChanges)
        window.sessionStorage.setItem(draftKey, JSON.stringify({ subject: subjectValue, content, shell }));
      else window.sessionStorage.removeItem(draftKey);
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [content, draftKey, hasChanges, shell, subjectValue]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const guardLinks = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || !hasChanges) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${target.pathname}${target.search}${target.hash}`);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [hasChanges]);

  function updateShell(change: Partial<EmailShellConfig>) {
    setShell((previous) => ({ ...previous, ...change }));
    setSaveMessage("");
    setPreviewState("pending");
    setPreviewError("");
  }

  async function refreshPreview() {
    const request = ++previewRequest.current;
    setPreviewState("pending");
    setPreviewError("");
    try {
      const nextPreview = await previewEmailTemplate(keyName, content, isLayout ? shell : undefined);
      if (request !== previewRequest.current) return;
      setPreview(nextPreview);
      setPreviewState("ready");
    } catch (error) {
      if (request !== previewRequest.current) return;
      setPreview("");
      setPreviewState("error");
      setPreviewError(error instanceof Error ? error.message : "Pratinjau tidak tersedia.");
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshPreview(), 600);
    return () => window.clearTimeout(timeout);
    // The server preview renders the body; subject is deliberately included so
    // its edited state also receives a fresh readiness check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, currentShell, isLayout, keyName, subjectValue]);

  useEffect(() => {
    if (currentError) errorRef.current?.focus();
  }, [currentError]);

  async function activate() {
    if (!formRef.current || !canActivate) return;
    setPending(true);
    setSaveMessage("");
    try {
      await saveEmailTemplate(new FormData(formRef.current));
      setSavedSubject(subjectValue);
      setSavedContent(currentContent);
      setSavedShell(currentShell);
      setSaveMessage("Versi baru langsung aktif. Email yang telah dikirim tidak berubah.");
      setConfirmOpen(false);
      window.sessionStorage.removeItem(draftKey);
      router.push(`/admin/settings/email-templates?kind=${encodeURIComponent(keyName)}&status=saved`);
      router.refresh();
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Perubahan tidak dapat disimpan.");
    } finally {
      setPending(false);
    }
  }

  async function sendTest() {
    if (!formRef.current || currentError) return;
    setTestPending(true);
    setSaveMessage("");
    try {
      const result = await sendEmailTemplateTest(new FormData(formRef.current));
      setSaveMessage(
        result.simulated
          ? "Simulasi lokal selesai. Tidak ada email yang dikirim."
          : "Email uji dikirim ke alamat akun Admin Anda.",
      );
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Email uji belum dapat dikirim.");
    } finally {
      setTestPending(false);
    }
  }

  return (
    <div className="email-template-workspace">
      <form
        className="email-template-edit-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (canActivate) setConfirmOpen(true);
          else if (currentError) errorRef.current?.focus();
        }}
        ref={formRef}
      >
        <input name="key" type="hidden" value={keyName} />
        {templateId ? <input name="templateId" type="hidden" value={templateId} /> : null}
        {isLayout ? <input name="shellConfig" type="hidden" value={currentShell} /> : null}
        <div className="email-template-edit-form__head">
          <div>
            <p className="eyebrow">Editor template</p>
            <h2>{keyName === "layout" ? "Tata letak" : "Pesan email"}</h2>
          </div>
          <span data-state={previewState} role="status">
            {previewState === "pending"
              ? "Memperbarui pratinjau"
              : currentError
                ? "Perlu diperbaiki"
                : hasChanges && previewState === "ready"
                  ? "Siap diaktifkan"
                  : "Belum ada perubahan"}
          </span>
        </div>

        {currentError ? (
          <div className="email-template-error" id="email-template-error" ref={errorRef} role="alert" tabIndex={-1}>
            <strong>Template belum siap diaktifkan</strong>
            <p>{currentError}</p>
          </div>
        ) : null}

        <label>
          Subjek {keyName === "layout" ? "(nama tata letak)" : "email"}
          <input
            aria-describedby={currentSubjectError ? "email-template-error" : undefined}
            aria-invalid={Boolean(currentSubjectError)}
            maxLength={998}
            name="subject"
            onChange={(event) => {
              setSubjectValue(event.target.value);
              setSaveMessage("");
              setPreviewState("pending");
              setPreviewError("");
            }}
            required={keyName !== "layout"}
            value={subjectValue}
          />
        </label>
        {subjectVariables.length ? (
          <label className="email-template-subject-variable">
            Sisipkan data ke subjek
            <select
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) {
                  setSubjectValue((previous) => `${previous}{{${event.target.value}}}`);
                  setPreviewState("pending");
                  setPreviewError("");
                }
                event.target.value = "";
              }}
            >
              <option value="">Pilih data…</option>
              {subjectVariables.map((variable) => (
                <option key={variable} value={variable}>
                  {emailVariableLabels[variable] ?? variable}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <p className="email-template-help">
          Tempel teks dari Word boleh; format tidak aman dibuang. Gambar hanya lewat tombol Gambar.{" "}
          {keyName === "layout"
            ? "Sisipkan {{message}} tepat satu kali sebagai paragraf tersendiri."
            : "Variabel tersedia pada daftar di atas editor."}
        </p>
        {isLayout ? (
          <fieldset className="email-template-shell-settings">
            <legend>Tampilan email</legend>
            <p>Preset Korporat Navy memakai logo resmi yang selalu dilampirkan secara privat pada email.</p>
            <div className="email-template-shell-settings__grid">
              <label>
                Preset
                <input readOnly value="Korporat Navy" aria-describedby="email-template-shell-help" />
              </label>
              <label>
                Warna aksen
                <select
                  value={shell.accent}
                  onChange={(event) => {
                    updateShell({ accent: event.target.value as EmailShellConfig["accent"] });
                  }}
                >
                  {emailShellAccents.map((accent) => (
                    <option key={accent} value={accent}>
                      {accent === "blue" ? "Biru korporat" : accent === "sky" ? "Biru langit" : "Emas"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nama perusahaan
                <input
                  maxLength={80}
                  value={shell.companyName}
                  onChange={(event) => updateShell({ companyName: event.target.value })}
                />
              </label>
              <label>
                Tagline
                <input
                  maxLength={100}
                  value={shell.tagline}
                  onChange={(event) => updateShell({ tagline: event.target.value })}
                />
              </label>
              <label>
                Email kontak
                <input
                  inputMode="email"
                  maxLength={254}
                  type="email"
                  value={shell.contactEmail}
                  onChange={(event) => updateShell({ contactEmail: event.target.value })}
                />
              </label>
              <label className="email-template-shell-settings__wide">
                Teks footer
                <input
                  maxLength={240}
                  value={shell.footerText}
                  onChange={(event) => updateShell({ footerText: event.target.value })}
                />
              </label>
            </div>
            <small id="email-template-shell-help">
              Logo resmi dikunci untuk menjaga identitas dan kompatibilitas email.
            </small>
          </fieldset>
        ) : (
          <p className="email-template-shell-note">Tampilan bermerek aktif otomatis dari Tata letak bersama.</p>
        )}
        <RichEmailEditor
          canUpload
          initial={content}
          key={`${templateId ?? keyName}-${editorEpoch}`}
          onChange={(next) => {
            setContent(next);
            setSaveMessage("");
            setPreviewState("pending");
            setPreviewError("");
          }}
          variables={variables}
        />
        <div className="email-template-actions">
          <button
            className="admin-secondary-button"
            disabled={Boolean(currentError) || testPending}
            onClick={() => void sendTest()}
            type="button"
          >
            {testPending ? "Mengirim uji…" : "Kirim email uji"}
          </button>
          <button
            className="admin-secondary-button"
            disabled={previewState === "pending"}
            onClick={() => void refreshPreview()}
            type="button"
          >
            {previewState === "pending" ? "Memperbarui…" : "Segarkan preview"}
          </button>
          <button className="admin-primary-button" disabled={!canActivate} type="submit">
            Simpan dan aktifkan
          </button>
        </div>
        {saveMessage ? (
          <p className="email-template-save-message" role="status">
            {saveMessage}
          </p>
        ) : null}
      </form>

      <aside className="email-template-preview" aria-label="Pratinjau template">
        <div className="email-template-preview__head">
          <div>
            <p className="eyebrow">Data transaksi nyata · hanya preview</p>
            <h2>Pratinjau email</h2>
          </div>
          <div aria-label="Lebar pratinjau" className="email-template-preview__switch" role="group">
            <button aria-pressed={width === "desktop"} onClick={() => setWidth("desktop")} type="button">
              Desktop
            </button>
            <button aria-pressed={width === "mobile"} onClick={() => setWidth("mobile")} type="button">
              Ponsel
            </button>
          </div>
        </div>
        <p>Pratinjau aman dipakai hanya untuk pemeriksaan visual dan tidak pernah dikirim.</p>
        {preview ? (
          <iframe
            className={
              width === "mobile"
                ? "email-template-preview__frame email-template-preview__frame--mobile"
                : "email-template-preview__frame"
            }
            sandbox=""
            srcDoc={preview}
            title="Pratinjau email"
          />
        ) : (
          <div className="email-template-preview__empty" role="status">
            {previewState === "pending"
              ? "Menyiapkan pratinjau terbaru…"
              : "Pratinjau akan tampil ketika template sudah valid."}
          </div>
        )}
      </aside>

      <Dialog.Root onOpenChange={setConfirmOpen} open={confirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="email-template-dialog__backdrop" />
          <Dialog.Content className="email-template-dialog" aria-describedby="email-template-activate-description">
            <p className="eyebrow">Konfirmasi aktivasi</p>
            <Dialog.Title>Aktifkan versi baru sekarang?</Dialog.Title>
            <Dialog.Description id="email-template-activate-description">
              Email berikutnya akan memakai template ini. Email yang sudah terkirim tidak berubah dan versi lama tetap
              dapat dipulihkan.
            </Dialog.Description>
            <dl>
              <div>
                <dt>Template</dt>
                <dd>{keyName === "layout" ? "Tata letak bersama untuk seluruh email" : "Email operasional"}</dd>
              </div>
              <div>
                <dt>Subjek</dt>
                <dd>{subjectValue.trim() || "Nama tata letak bersama"}</dd>
              </div>
            </dl>
            <div className="email-template-dialog__actions">
              <Dialog.Close asChild>
                <button className="admin-secondary-button" type="button">
                  Kembali
                </button>
              </Dialog.Close>
              <button
                className="admin-primary-button"
                disabled={!canActivate}
                onClick={() => void activate()}
                type="button"
              >
                {pending ? "Mengaktifkan…" : "Aktifkan versi baru"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={Boolean(pendingHref)}
        onOpenChange={(open) => {
          if (!open) setPendingHref(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="email-template-dialog__backdrop" />
          <Dialog.Content className="email-template-dialog" aria-describedby="email-template-leave-description">
            <p className="eyebrow">PERUBAHAN BELUM DISIMPAN</p>
            <Dialog.Title>Tinggalkan editor?</Dialog.Title>
            <Dialog.Description id="email-template-leave-description">
              Draft tetap tersimpan selama sesi ini dan dapat dipulihkan saat Anda kembali.
            </Dialog.Description>
            <div className="email-template-dialog__actions">
              <Dialog.Close asChild>
                <button className="admin-secondary-button" type="button">
                  Lanjut mengedit
                </button>
              </Dialog.Close>
              <button
                className="admin-primary-button"
                onClick={() => {
                  if (pendingHref) router.push(pendingHref);
                  setPendingHref(null);
                }}
                type="button"
              >
                Tinggalkan editor
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
