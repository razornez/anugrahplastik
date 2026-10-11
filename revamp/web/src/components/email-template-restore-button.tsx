"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { restoreEmailTemplate } from "@/features/integrations/email-template-actions";

export function EmailTemplateRestoreButton({ versionId, version }: { versionId: string; version: number }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function restore() {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("versionId", versionId);
      await restoreEmailTemplate(form);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Versi tidak dapat dipulihkan.");
      setBusy(false);
    }
  }

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger asChild>
        <button className="admin-secondary-button" type="button">
          Pulihkan versi ini
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="email-template-dialog__backdrop" />
        <Dialog.Content className="email-template-dialog" aria-describedby="email-template-restore-description">
          <p className="eyebrow">Pulihkan versi</p>
          <Dialog.Title>Aktifkan kembali versi {version}?</Dialog.Title>
          <Dialog.Description id="email-template-restore-description">
            Email berikutnya akan memakai isi versi ini. Riwayat saat ini tetap tersimpan sebagai versi sebelumnya.
          </Dialog.Description>
          {error ? (
            <p className="email-template-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="email-template-dialog__actions">
            <Dialog.Close asChild>
              <button className="admin-secondary-button" disabled={busy} type="button">
                Kembali
              </button>
            </Dialog.Close>
            <button className="admin-primary-button" disabled={busy} onClick={() => void restore()} type="button">
              {busy ? "Memulihkan…" : "Pulihkan dan aktifkan"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
