"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { AdminDialogPortalFrame } from "@/components/admin-dialog-portal-frame";
import { createEmailTemplate } from "@/features/integrations/email-template-actions";
import type { TemplateKey } from "@/features/integrations/email-templates";

export function EmailTemplateCreateDialog({ templateKey }: { templateKey: TemplateKey }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger asChild>
        <button className="admin-primary-button" type="button">
          Tambah template
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <AdminDialogPortalFrame>
          <Dialog.Overlay className="email-template-dialog__backdrop" />
          <Dialog.Content className="email-template-dialog email-template-create-dialog">
            <span aria-hidden="true" className="email-template-create-dialog__handle" />
            <header>
              <span>
                <p className="eyebrow">Template baru</p>
                <Dialog.Title>Tambah template email</Dialog.Title>
              </span>
              <Dialog.Close aria-label="Tutup form tambah template" className="admin-sheet__close">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </Dialog.Close>
            </header>
            <Dialog.Description>
              Isi awal disalin dari template default aktif dan dapat diubah setelah dibuat.
            </Dialog.Description>
            <form action={createEmailTemplate} className="email-template-create-form">
              <input name="key" type="hidden" value={templateKey} />
              <label>
                Nama template
                <input autoFocus maxLength={120} name="name" placeholder="Contoh: Penawaran pelanggan baru" required />
              </label>
              <label>
                Bahasa
                <select defaultValue="id" name="language">
                  <option value="id">Bahasa Indonesia</option>
                  <option value="en">English</option>
                </select>
              </label>
              <div className="email-template-dialog__actions">
                <Dialog.Close asChild>
                  <button className="admin-secondary-button" type="button">
                    Batal
                  </button>
                </Dialog.Close>
                <button className="admin-primary-button" type="submit">
                  Buat dan buka editor
                </button>
              </div>
            </form>
          </Dialog.Content>
        </AdminDialogPortalFrame>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
