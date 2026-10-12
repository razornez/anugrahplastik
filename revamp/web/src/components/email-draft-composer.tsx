"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveEmailDraft,
  prepareEmailDraft,
  confirmEmailDraft,
  copyEmailDraft,
  removeEmailDraftFile,
} from "@/features/integrations/email-workspace-actions";
import type { DraftView } from "@/features/integrations/email-drafts";
import { outgoingStatusLabel } from "@/features/integrations/email-workspace-model";
import { EmailEditorShimmer } from "@/components/email-loading-shimmer";
const Editor = dynamic(() => import("./rich-email-editor").then((module) => module.RichEmailEditor), {
  loading: () => <EmailEditorShimmer />,
});

export function EmailDraftComposer({ initial, currentUserId }: { initial: DraftView; currentUserId: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial.payload);
  const [revision, setRevision] = useState(initial.revision);
  const revisionRef = useRef(initial.revision);
  const [autosavePaused, setAutosavePaused] = useState(false);
  const [files, setFiles] = useState(initial.files);
  const [saveStatus, setSaveStatus] = useState("Tersimpan");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copies, setCopies] = useState(Boolean(value.cc || value.bcc));
  const [preview, setPreview] = useState<Extract<Awaited<ReturnType<typeof prepareEmailDraft>>, { ok: true }> | null>(
    null,
  );
  const [sent, setSent] = useState(
    initial.status === "draft" ? "" : "Draf ini sudah diproses. Periksa status pengiriman.",
  );
  const dirty = useRef(false);
  const saving = useRef(false);
  const version = useRef(0);
  const mounted = useRef(true);
  async function save() {
    if (saving.current) return false;
    if (!dirty.current) return true;
    saving.current = true;
    setSaveStatus("Menyimpan…");
    const captured = version.current;
    let result: Awaited<ReturnType<typeof saveEmailDraft>>;
    try {
      result = await saveEmailDraft(initial.id, revisionRef.current, value);
    } catch {
      result = { ok: false, error: "Koneksi terputus. Isi Anda tetap di editor; coba simpan lagi." };
    }
    saving.current = false;
    if (!mounted.current) return false;
    if (!result.ok) {
      setAutosavePaused(true);
      setSaveStatus("Gagal menyimpan");
      setError(result.error);
      return false;
    }
    revisionRef.current = result.revision;
    setRevision(result.revision);
    dirty.current = captured !== version.current;
    setError("");
    setAutosavePaused(false);
    setSaveStatus(dirty.current ? "Perubahan belum tersimpan" : "Tersimpan");
    return !dirty.current;
  }
  useEffect(() => {
    mounted.current = true;
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      mounted.current = true;
      saving.current = false;
      setBusy(false);
      setPreview(null);
      if (dirty.current) {
        setAutosavePaused(true);
        setSaveStatus("Perubahan belum tersimpan");
        setError(
          "Draf dipulihkan dari riwayat browser. Simpan kembali; jika versinya berubah, buat salinan agar isi tidak hilang.",
        );
      }
    };
    window.addEventListener("pageshow", restore);
    return () => {
      mounted.current = false;
      window.removeEventListener("pageshow", restore);
    };
  }, []);
  useEffect(() => {
    if (!dirty.current || busy || sent || autosavePaused) return;
    const timeout = setTimeout(() => void save(), 1500);
    return () => clearTimeout(timeout);
  });
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current || saving.current) {
        event.preventDefault();
        // Older browsers require returnValue as well as preventDefault.
        event.returnValue = "";
      }
    };
    const navigate = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (
        link &&
        link.target !== "_blank" &&
        !link.hasAttribute("download") &&
        (dirty.current || saving.current) &&
        !window.confirm("Perubahan belum tersimpan. Tinggalkan draf?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    // Navigation API catches browser Back/Forward before the App Router unmounts the editor.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const historyNavigate = (event: Event) => {
      if (
        (event as Event & { navigationType?: string }).navigationType === "traverse" &&
        event.cancelable &&
        (dirty.current || saving.current) &&
        !window.confirm("Perubahan belum tersimpan. Tinggalkan draf?")
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigate, true);
    navigation?.addEventListener("navigate", historyNavigate);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", navigate, true);
      navigation?.removeEventListener("navigate", historyNavigate);
    };
  }, []);
  function change(next: Partial<typeof value>) {
    version.current++;
    dirty.current = true;
    setAutosavePaused(false);
    setValue((current) => ({ ...current, ...next }));
    setPreview(null);
    setSaveStatus("Perubahan belum tersimpan");
  }
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      if (!(await save())) return;
      const result = await prepareEmailDraft(initial.id, revisionRef.current);
      if (result.ok) setPreview(result);
      else setError(result.error);
    } catch {
      setError("Pratinjau belum tersedia. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(selected: File[]) {
    if (!selected.length || busy) return;
    if (files.length + selected.length + (value.documentSource ? 1 : 0) > 5) {
      setError("Maksimal 5 lampiran per email. Kurangi file yang dipilih atau hapus lampiran sebelumnya.");
      return;
    }
    if (
      selected.some((file) => !file.size) ||
      [...files, ...selected].reduce((total, file) => total + file.size, 0) > 10 * 1024 * 1024
    ) {
      setError("Berkas tidak boleh kosong dan total lampiran maksimal 10 MB.");
      return;
    }
    setBusy(true);
    setError("");
    let uploaded = 0;
    try {
      if (!(await save())) return;
      for (const file of selected) {
        const response = await fetch(
          `/api/admin/email-drafts/${initial.id}/files?revision=${revisionRef.current}&filename=${encodeURIComponent(file.name)}`,
          { method: "POST", body: file },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        revisionRef.current = result.revision;
        setRevision(result.revision);
        setFiles(result.files);
        setPreview(null);
        uploaded += 1;
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Unggah gagal.";
      setError(
        `${uploaded} dari ${selected.length} file berhasil diunggah. ${reason} File yang berhasil tetap tersimpan; periksa daftar sebelum mencoba lagi.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await confirmEmailDraft(preview.attemptId);
      if (result.ok) {
        setSent(outgoingStatusLabel(result.status));
        setPreview(null);
        dirty.current = false;
      } else setError(result.error);
    } catch {
      setError("Status pengiriman belum pasti. Periksa Terkirim; jangan kirim ulang.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  async function remove(fileId: string) {
    setBusy(true);
    setError("");
    try {
      if (!(await save())) return;
      const result = await removeEmailDraftFile(initial.id, revisionRef.current, fileId);
      if (!result.ok) throw new Error(result.error);
      revisionRef.current = result.revision;
      setRevision(result.revision);
      setFiles(result.files);
      setPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lampiran belum dapat dihapus.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="email-form email-draft-composer" aria-label="Editor draf">
      <div className="email-composer-heading">
        <div>
          <p className="admin-eyebrow">{value.replyToId ? "BALASAN" : "PESAN BARU"}</p>
          <h2>{value.replyToId ? "Tulis balasan" : "Tulis email"}</h2>
        </div>
        <span role="status">
          {saveStatus} · versi {revision}
        </span>
      </div>
      {initial.ownerId !== currentUserId ? (
        <p className="integration-alert">Anda sedang meninjau draf milik anggota tim.</p>
      ) : null}
      {value.documentSource ? (
        <p className="integration-alert">
          Dokumen transaksi versi {value.documentSource.version} menjadi lampiran wajib. PDF akan diperiksa lagi sebelum
          pengiriman. <a href={`/admin/transactions/${value.documentSource.transactionId}`}>Kembali ke transaksi</a>
        </p>
      ) : null}
      {sent ? (
        <p className="integration-success" role="status">
          {sent}. <a href="/admin/email?folder=sent">Periksa status pengiriman</a>
        </p>
      ) : (
        <fieldset disabled={busy}>
          <label>
            To, penerima utama
            <input
              type="text"
              inputMode="email"
              autoComplete="off"
              value={value.to}
              readOnly={Boolean(value.documentSource)}
              onChange={(event) => change({ to: event.target.value })}
              placeholder="nama@perusahaan.com"
            />
          </label>
          <button
            type="button"
            className="admin-secondary-button"
            aria-expanded={copies}
            disabled={Boolean(value.documentSource)}
            onClick={() => setCopies(!copies)}
          >
            CC / BCC
          </button>
          {copies ? (
            <>
              <label>
                CC, penerima salinan
                <input inputMode="email" value={value.cc} onChange={(event) => change({ cc: event.target.value })} />
              </label>
              <label>
                BCC, salinan tersembunyi
                <input inputMode="email" value={value.bcc} onChange={(event) => change({ bcc: event.target.value })} />
              </label>
            </>
          ) : null}
          <p className="email-help">
            {value.documentSource
              ? "Penerima harus cocok dengan Data master pelanggan. CC/BCC tidak tersedia untuk dokumen transaksi."
              : "Pisahkan alamat dengan koma. Maksimal 20 penerima unik."}
          </p>
          <label>
            Subjek
            <input
              value={value.subject}
              maxLength={998}
              onChange={(event) => change({ subject: event.target.value })}
            />
          </label>
          <div className="email-form__message" inert={busy}>
            <strong>Pesan</strong>
            <Editor initial={initial.payload.content} name="bodyJson" onChange={(content) => change({ content })} />
          </div>
          <label className="email-upload">
            Tambah lampiran
            <input
              type="file"
              multiple
              disabled={busy}
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                event.target.value = "";
                void upload(selected);
              }}
            />
          </label>
          <p className="email-help">
            Pilih beberapa file sekaligus · PDF, JPG, PNG, WebP · maksimal 5 lampiran, total 10 MB termasuk gambar
            template. PDF transaksi wajib termasuk dalam batas lampiran.
          </p>
          {files.map((file) => (
            <div className="email-file" key={file.id}>
              <a href={`/api/admin/email-drafts/${initial.id}/files?file=${file.id}`} download>
                {file.filename}
              </a>
              <span>{(file.size / 1024).toLocaleString("id-ID", { maximumFractionDigits: 0 })} KB</span>
              <button type="button" aria-label={`Hapus lampiran ${file.filename}`} onClick={() => void remove(file.id)}>
                Hapus
              </button>
            </div>
          ))}
          <div className="email-composer-actions">
            <button type="button" className="admin-secondary-button" onClick={() => void save()}>
              Simpan draf
            </button>
            <button type="button" className="admin-primary-button" onClick={() => void prepare()}>
              {busy ? "Memproses…" : "Periksa sebelum kirim"}
            </button>
          </div>
        </fieldset>
      )}
      {error ? (
        <div className="integration-alert" role="alert">
          <p>{error}</p>
          {autosavePaused ? (
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                try {
                  const copy = await copyEmailDraft(initial.id, value);
                  dirty.current = false;
                  router.push(`/admin/email?folder=drafts&draft=${copy.id}`);
                } catch {
                  setError("Draf baru belum tersimpan. Isi Anda tetap ada di editor.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Simpan isi sebagai draf baru
            </button>
          ) : null}
        </div>
      ) : null}
      {preview ? (
        <section className="email-final-preview" aria-label="Konfirmasi pengiriman">
          <h3>Periksa penerima dan isi terakhir</h3>
          {preview.documentInfo ? (
            <p>
              Dokumen: {preview.documentInfo.number || "Nomor belum tersedia"} ·
              {(
                {
                  quotation: "Penawaran",
                  invoice_dp: "Invoice DP",
                  invoice_final: "Invoice pelunasan",
                  delivery_note: "Surat jalan",
                } as Record<string, string>
              )[preview.documentInfo.type] || "Dokumen transaksi"}{" "}
              · versi {preview.documentInfo.version}
            </p>
          ) : null}
          <dl>
            <dt>Dari</dt>
            <dd>{preview.from}</dd>
            <dt>To</dt>
            <dd>{preview.recipients.to.join(", ")}</dd>
            <dt>CC</dt>
            <dd>{preview.recipients.cc.join(", ") || "Tidak ada"}</dd>
            <dt>BCC</dt>
            <dd>{preview.recipients.bcc.join(", ") || "Tidak ada"}</dd>
            <dt>Subjek</dt>
            <dd>{preview.subject}</dd>
          </dl>
          {preview.files.map((file) => (
            <p key={file.filename}>Lampiran: {file.filename}</p>
          ))}
          <iframe title="Pratinjau email final" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html} />
          <details>
            <summary>Versi teks biasa</summary>
            <pre>{preview.text}</pre>
          </details>
          <p>
            {preview.simulation
              ? "Mode simulasi lokal: email tidak akan dikirim ke penerima."
              : "Pengiriman menggunakan isi dan penerima di atas. Periksa kembali sebelum mengonfirmasi."}
          </p>
          <button disabled={busy} type="button" className="admin-primary-button" onClick={() => void send()}>
            {preview.simulation ? "Jalankan simulasi. Email tidak dikirim." : "Konfirmasi kirim email"}
          </button>
          <button disabled={busy} type="button" onClick={() => setPreview(null)}>
            Kembali mengedit
          </button>
        </section>
      ) : null}
    </section>
  );
}
