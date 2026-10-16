"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { AdminDialogPortalFrame } from "@/components/admin-dialog-portal-frame";
import { useAdminToast } from "@/components/admin-ui";
import { invalidateTransactionList } from "@/components/transaction-session-state";
import { saveTransactionTitleInline, setTransactionArchived } from "@/features/operations/workflow-actions";
import {
  deleteTransactionPermanently,
  type TransactionDeletionImpact,
} from "@/features/operations/transaction-deletion";

export function TransactionTitleEditor({ id, title }: { id: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [draft, setDraft] = useState(title);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const notify = useAdminToast();

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  async function save(formData: FormData) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await saveTransactionTitleInline({ ok: false, message: "" }, formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEditing(false);
      invalidateTransactionList();
      router.refresh();
      notify({ title: "Judul tersimpan", message: result.message, tone: "success" });
    } catch {
      setError("Judul belum tersimpan. Periksa koneksi lalu coba lagi.");
    } finally {
      setPending(false);
    }
  }

  function close() {
    if (pending) return;
    setEditing(false);
    setDraft(title);
    trigger.current?.focus();
  }

  const form = (
    <form action={save} aria-busy={pending} className="transaction-title-editor__form">
      <input name="transactionId" type="hidden" value={id} />
      <label htmlFor={mobile ? "transaction-title-mobile" : "transaction-title-desktop"}>Judul pekerjaan</label>
      <input
        autoFocus
        id={mobile ? "transaction-title-mobile" : "transaction-title-desktop"}
        maxLength={180}
        minLength={2}
        name="title"
        onChange={(event) => setDraft(event.target.value)}
        required
        value={draft}
      />
      {error ? (
        <p className="transaction-inline-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="transaction-title-editor__actions">
        <button disabled={pending} onClick={close} type="button">
          Batal
        </button>
        <button className="admin-primary-button" disabled={pending || draft.trim().length < 2} type="submit">
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </form>
  );

  return (
    <span className="transaction-title-editor">
      <button
        aria-label="Edit judul pekerjaan"
        className="transaction-title-editor__trigger"
        onClick={() => {
          setDraft(title);
          setError("");
          setEditing(true);
        }}
        ref={trigger}
        type="button"
      >
        <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="m15 5 4 4M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z" />
        </svg>
      </button>
      {editing && !mobile ? (
        <div
          className="transaction-title-editor__inline"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
          {form}
        </div>
      ) : null}
      {mobile ? (
        <Dialog.Root
          open={editing}
          onOpenChange={(next) => {
            if (!next) close();
          }}
        >
          <Dialog.Portal>
            <AdminDialogPortalFrame>
              <Dialog.Overlay className="transaction-delete-overlay" />
              <Dialog.Content
                aria-describedby="transaction-title-description"
                className="transaction-title-editor__sheet"
              >
                <Dialog.Title>Edit judul pekerjaan</Dialog.Title>
                <Dialog.Description id="transaction-title-description">
                  Judul baru tidak mengubah PDF atau email yang sudah terbit.
                </Dialog.Description>
                {form}
              </Dialog.Content>
            </AdminDialogPortalFrame>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </span>
  );
}

export function TransactionManagement({
  id,
  referenceNo,
  isAdmin,
  archived,
  deletionImpact,
}: {
  id: string;
  referenceNo: string;
  isAdmin: boolean;
  archived: boolean;
  deletionImpact?: TransactionDeletionImpact | null;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typedReference, setTypedReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, deleteAction, deleting] = useActionState(deleteTransactionPermanently, { ok: false, message: "" });
  const notify = useAdminToast();
  useEffect(() => {
    if (!result.message) return;
    notify({
      title: result.ok ? "Transaksi dihapus" : "Penghapusan ditolak",
      message: result.message,
      tone: result.ok ? "success" : "error",
    });
  }, [notify, result]);
  return (
    <div className="transaction-management">
      {isAdmin ? (
        <details className="transaction-management__menu">
          <summary aria-label="Aksi lainnya untuk transaksi" title="Aksi lainnya">
            <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </summary>
          <div className="transaction-management__menu-content">
            <form
              action={setTransactionArchived}
              onSubmit={(event) => {
                if (
                  !window.confirm(
                    archived
                      ? `Pulihkan ${referenceNo} ke daftar aktif?`
                      : `Arsipkan ${referenceNo}? Dokumen dan riwayatnya tetap tersimpan.`,
                  )
                )
                  event.preventDefault();
                else invalidateTransactionList();
              }}
            >
              <input name="transactionId" type="hidden" value={id} />
              <input name="archive" type="hidden" value={archived ? "no" : "yes"} />
              <button type="submit">{archived ? "Pulihkan transaksi" : "Arsipkan transaksi"}</button>
            </form>
            {isAdmin && deletionImpact ? (
              <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
                <Dialog.Trigger asChild>
                  <button className="transaction-management__delete" type="button">
                    Hapus permanen…
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <AdminDialogPortalFrame>
                    <Dialog.Overlay className="transaction-delete-overlay" />
                    <Dialog.Content
                      className="transaction-delete-dialog"
                      aria-describedby="transaction-delete-description"
                    >
                      <Dialog.Title>Hapus permanen {referenceNo}?</Dialog.Title>
                      <Dialog.Description id="transaction-delete-description">
                        Tindakan ini tidak dapat dibatalkan dari Back Office. Nomor dokumen resmi tidak akan digunakan
                        ulang.
                      </Dialog.Description>
                      <dl>
                        <div>
                          <dt>Dokumen</dt>
                          <dd>{deletionImpact.documents}</dd>
                        </div>
                        <div>
                          <dt>Invoice</dt>
                          <dd>{deletionImpact.invoices}</dd>
                        </div>
                        <div>
                          <dt>Pembayaran</dt>
                          <dd>{deletionImpact.payments}</dd>
                        </div>
                        <div>
                          <dt>Produksi</dt>
                          <dd>{deletionImpact.batches}</dd>
                        </div>
                        <div>
                          <dt>Pengiriman</dt>
                          <dd>{deletionImpact.shipments}</dd>
                        </div>
                        <div>
                          <dt>Email terkait</dt>
                          <dd>{deletionImpact.emails}</dd>
                        </div>
                        <div>
                          <dt>File privat</dt>
                          <dd>{deletionImpact.privateFiles}</dd>
                        </div>
                        <div>
                          <dt>File 3D master</dt>
                          <dd>{deletionImpact.designFiles}</dd>
                        </div>
                      </dl>
                      <p>
                        Invoice, pembayaran, dokumen, produksi, dan pengiriman dihapus. Email terkirim tidak bisa
                        ditarik kembali dan tetap berada di Email CS tanpa tautan transaksi. File 3D master tetap ada,
                        hanya relasinya dilepas. File privat masuk antrean pembersihan.
                      </p>
                      {deletionImpact.uncertain ? (
                        <p className="transaction-inline-error" role="alert">
                          PDF atau email masih berstatus belum pasti. Periksa dan selesaikan statusnya sebelum
                          menghapus.
                        </p>
                      ) : null}
                      <form action={deleteAction} onSubmit={() => invalidateTransactionList()}>
                        <input name="transactionId" type="hidden" value={id} />
                        <label>
                          Ketik nomor transaksi untuk konfirmasi
                          <input
                            autoComplete="off"
                            name="referenceNo"
                            onChange={(event) => setTypedReference(event.target.value)}
                            value={typedReference}
                          />
                        </label>
                        <label className="transaction-delete-dialog__check">
                          <input
                            checked={confirmed}
                            name="dummyConfirmed"
                            onChange={(event) => setConfirmed(event.target.checked)}
                            type="checkbox"
                            value="yes"
                          />
                          Saya menyatakan transaksi ini data dummy/testing, bukan transaksi pelanggan nyata.
                        </label>
                        {result.message && !result.ok ? (
                          <p className="transaction-inline-error" role="alert">
                            {result.message}
                          </p>
                        ) : null}
                        <div className="transaction-delete-dialog__actions">
                          <Dialog.Close type="button">Batal</Dialog.Close>
                          <button
                            disabled={
                              deleting || deletionImpact.uncertain || !confirmed || typedReference !== referenceNo
                            }
                            type="submit"
                          >
                            {deleting ? "Menghapus…" : "Hapus permanen"}
                          </button>
                        </div>
                      </form>
                    </Dialog.Content>
                  </AdminDialogPortalFrame>
                </Dialog.Portal>
              </Dialog.Root>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
