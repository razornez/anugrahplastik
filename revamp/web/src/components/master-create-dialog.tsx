"use client";

import { useRef } from "react";

type Props = { label: string; children: React.ReactNode; action: (formData: FormData) => void | Promise<void> };

export function MasterCreateDialog({ label, children, action }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button className="master-primary-action" type="button" onClick={() => dialogRef.current?.showModal()}>
        {label}
      </button>
      <dialog className="master-dialog" ref={dialogRef} aria-label={label}>
        <form method="dialog" className="master-dialog__close">
          <button type="submit" aria-label="Tutup">
            ×
          </button>
        </form>
        <div className="master-dialog__body">
          <p className="eyebrow">Data master baru</p>
          <h2>{label}</h2>
          <p>Kode dibuat otomatis oleh sistem setelah data disimpan.</p>
          <form action={action} className="master-dialog__form">
            {children}
            <button type="submit">Simpan</button>
          </form>
        </div>
      </dialog>
    </>
  );
}
