"use client";

import { useRef } from "react";

type MasterKind = "customers" | "suppliers" | "materials" | "products" | "moulds";
type Mutation = (formData: FormData) => void | Promise<void>;

export function MasterRecordDialog({
  id,
  kind,
  title,
  status,
  updateAction,
  deleteAction,
}: {
  id: string;
  kind: MasterKind;
  title: string;
  status: string;
  updateAction: Mutation;
  deleteAction: Mutation;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const safeKind = kind.slice(0, -1);
  return (
    <>
      <button
        className="directory-manage"
        type="button"
        ref={triggerRef}
        onClick={() => dialogRef.current?.showModal()}
      >
        Kelola
      </button>
      <dialog
        className="master-dialog master-dialog--manage"
        ref={dialogRef}
        onClose={() => triggerRef.current?.focus()}
      >
        <form method="dialog" className="master-dialog__close">
          <button type="submit" aria-label="Tutup">
            ×
          </button>
        </form>
        <div className="master-dialog__body">
          <p className="eyebrow">Kelola data master</p>
          <h2>{title}</h2>
          <form action={updateAction} className="master-dialog__form">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="kind" value={safeKind} />
            <label>
              Nama
              <input name="name" defaultValue={title} required maxLength={180} />
            </label>
            <label>
              Status
              <select name="status" defaultValue={status}>
                {kind === "moulds" ? <option value="planned">Direncanakan</option> : null}
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </label>
            <button type="submit">Simpan perubahan</button>
          </form>
          <form action={deleteAction} className="master-delete-form">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="kind" value={safeKind} />
            <p>Hapus hanya bila data ini belum pernah dipakai pada pekerjaan atau file desain.</p>
            <button type="submit">Hapus permanen</button>
          </form>
        </div>
      </dialog>
    </>
  );
}
