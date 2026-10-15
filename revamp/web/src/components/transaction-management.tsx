"use client";

import { useActionState, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AdminDialogPortalFrame } from "@/components/admin-dialog-portal-frame";
import { useAdminToast } from "@/components/admin-ui";
import { invalidateTransactionList } from "@/components/transaction-session-state";
import { setTransactionArchived, updateTransactionTitle } from "@/features/operations/workflow-actions";
import {
  deleteTransactionPermanently,
  type TransactionDeletionImpact,
} from "@/features/operations/transaction-deletion";

export function TransactionManagement({
  id,
  referenceNo,
  title,
  step,
  isAdmin,
  archived,
  deletionImpact,
}: {
  id: string;
  referenceNo: string;
  title: string;
  step: string;
  isAdmin: boolean;
  archived: boolean;
  deletionImpact?: TransactionDeletionImpact | null;
}) {
  const [editing, setEditing] = useState(false);
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
      <button onClick={() => setEditing((current) => !current)} type="button">
        {editing ? "Batal edit" : "Edit judul"}
      </button>
      {editing ? (
        <form action={updateTransactionTitle} onSubmit={() => invalidateTransactionList()}>
          <input name="transactionId" type="hidden" value={id} />
          <input name="step" type="hidden" value={step} />
          <label>
            Judul pekerjaan
            <input autoFocus defaultValue={title} maxLength={180} minLength={2} name="title" required />
          </label>
          <button type="submit">Simpan judul</button>
        </form>
      ) : null}
      {isAdmin ? (
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
      ) : null}
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
              <Dialog.Content className="transaction-delete-dialog" aria-describedby="transaction-delete-description">
                <Dialog.Title>Hapus permanen {referenceNo}?</Dialog.Title>
                <Dialog.Description id="transaction-delete-description">
                  Tindakan ini tidak dapat dibatalkan dari Back Office. Nomor dokumen resmi tidak akan digunakan ulang.
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
                  Invoice, pembayaran, dokumen, produksi, dan pengiriman dihapus. Email terkirim tidak bisa ditarik
                  kembali dan tetap berada di Email CS tanpa tautan transaksi. File 3D master tetap ada, hanya relasinya
                  dilepas. File privat masuk antrean pembersihan.
                </p>
                {deletionImpact.uncertain ? (
                  <p className="transaction-inline-error" role="alert">
                    PDF atau email masih berstatus belum pasti. Periksa dan selesaikan statusnya sebelum menghapus.
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
                      disabled={deleting || deletionImpact.uncertain || !confirmed || typedReference !== referenceNo}
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
  );
}
