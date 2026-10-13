"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { DesignFileOptions, DesignLinkOption } from "@/components/design-upload-form";

export type ManagedDesignFile = {
  id: string;
  originalName: string;
  format: string;
  origin: string;
  fileKind: string;
  description: string | null;
  productId: string | null;
  mouldId: string | null;
  customerId: string | null;
  transactionId: string | null;
  materialId: string | null;
  updatedAt: string;
};

function targetFor(file: ManagedDesignFile, links: DesignLinkOption[]) {
  const targets: Array<[DesignLinkOption["type"], string | null]> = [
    ["product", file.productId],
    ["mould", file.mouldId],
    ["transaction", file.transactionId],
    ["customer", file.customerId],
  ];
  for (const [type, id] of targets) {
    const option = id ? links.find((item) => item.type === type && item.id === id) : null;
    if (option) return option;
  }
  return null;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-6.25 9.5-6.25S21.5 12 21.5 12s-3.5 6.25-9.5 6.25S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.75 5.25 4 4M4 20l3.9-.75L19.5 7.65a1.8 1.8 0 0 0 0-2.55l-.6-.6a1.8 1.8 0 0 0-2.55 0L4.75 16.1 4 20Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 7h15M9 7V4.75h6V7m2.5 0-.75 12.25H7.25L6.5 7M9.5 10.5v5.75m5-5.75v5.75" />
    </svg>
  );
}

function IconTooltip({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span className="design-file-action-tooltip" id={id} role="tooltip">
      {children}
    </span>
  );
}

export function DesignFileActions({
  file,
  options,
  canDelete,
  detailHref,
  redirectAfterDelete = false,
}: {
  file: ManagedDesignFile;
  options: DesignFileOptions;
  canDelete: boolean;
  detailHref?: string;
  redirectAfterDelete?: boolean;
}) {
  const router = useRouter();
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const target = targetFor(file, options.links);
  const customer = file.customerId ? options.customers.find((item) => item.id === file.customerId) : null;
  const listSuffix = file.id.replace(/[^a-zA-Z0-9]/g, "");
  const editDialogId = `design-edit-${listSuffix}`;
  const deleteDialogId = `design-delete-${listSuffix}`;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("save");
    setEditMessage(null);
    try {
      const formData = new FormData(event.currentTarget);
      const targetLookup = String(formData.get("targetLookup") ?? "").trim();
      const selectedTarget = options.links.find((item) => item.label === targetLookup);
      const customerLookup = String(formData.get("customerLookup") ?? "").trim();
      const selectedCustomer = options.customers.find((item) => item.label === customerLookup);
      if (targetLookup && !selectedTarget) throw new Error("Pilih tautan kerja dari saran yang tersedia.");
      if (customerLookup && !selectedCustomer) throw new Error("Pilih customer dari saran yang tersedia.");
      if (selectedCustomer && selectedTarget?.type === "customer" && selectedTarget.id !== selectedCustomer.id)
        throw new Error("Customer terkait harus sama dengan customer pada tautan kerja.");
      formData.delete("targetLookup");
      formData.delete("customerLookup");
      for (const key of ["productId", "mouldId", "customerId", "transactionId"]) formData.delete(key);
      if (selectedTarget) formData.set(`${selectedTarget.type}Id`, selectedTarget.id);
      if (selectedCustomer && selectedTarget?.type !== "customer") formData.set("customerId", selectedCustomer.id);
      const replacement = formData.get("file");
      if (!(replacement instanceof File) || !replacement.name) formData.delete("file");
      const response = await fetch(`/api/admin/design-files/${file.id}`, { method: "PATCH", body: formData });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Perubahan belum dapat disimpan.");
      editDialogRef.current?.close();
      router.refresh();
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : "Perubahan belum dapat disimpan.");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const remove = async () => {
    if (busyRef.current || deleteName !== file.originalName) return;
    busyRef.current = true;
    setBusy("delete");
    setDeleteMessage(null);
    try {
      const response = await fetch(`/api/admin/design-files/${file.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteName }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "File belum dapat dihapus.");
      deleteDialogRef.current?.close();
      if (redirectAfterDelete) router.push("/admin/masters/designs");
      else router.refresh();
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "File belum dapat dihapus.");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  return (
    <>
      <span className="design-file-actions" aria-label={`Aksi untuk ${file.originalName}`}>
        {detailHref ? (
          <Link
            className="design-file-icon-action design-file-icon-action--view"
            href={detailHref}
            aria-label={`Lihat detail ${file.originalName}`}
            aria-describedby={`design-view-tip-${listSuffix}`}
          >
            <EyeIcon />
            <IconTooltip id={`design-view-tip-${listSuffix}`}>Lihat detail</IconTooltip>
          </Link>
        ) : null}
        <button
          ref={editTriggerRef}
          type="button"
          className="design-file-icon-action design-file-icon-action--edit"
          aria-label={`Edit ${file.originalName}`}
          aria-describedby={`design-edit-tip-${listSuffix}`}
          aria-haspopup="dialog"
          aria-controls={editDialogId}
          onClick={() => editDialogRef.current?.showModal()}
        >
          <PencilIcon />
          <IconTooltip id={`design-edit-tip-${listSuffix}`}>Edit file</IconTooltip>
        </button>
        {canDelete ? (
          <button
            ref={deleteTriggerRef}
            type="button"
            className="design-file-icon-action design-file-icon-action--delete"
            aria-label={`Hapus ${file.originalName}`}
            aria-describedby={`design-delete-tip-${listSuffix}`}
            aria-haspopup="dialog"
            aria-controls={deleteDialogId}
            onClick={() => deleteDialogRef.current?.showModal()}
          >
            <TrashIcon />
            <IconTooltip id={`design-delete-tip-${listSuffix}`}>Hapus file</IconTooltip>
          </button>
        ) : null}
      </span>

      <dialog
        ref={editDialogRef}
        id={editDialogId}
        className="master-dialog design-manage-dialog design-edit-dialog"
        data-busy={busy === "save"}
        onClose={() => {
          setEditMessage(null);
          editTriggerRef.current?.focus();
        }}
        onCancel={(event) => {
          if (busy === "save") event.preventDefault();
        }}
      >
        <form method="dialog" className="master-dialog__close">
          <button type="submit" aria-label="Tutup editor file" disabled={busy === "save"}>
            ×
          </button>
        </form>
        <div className="master-dialog__body">
          <p className="eyebrow">Edit file 3D</p>
          <h2>{file.originalName}</h2>
          <p>Perbarui informasi atau ganti file sumber tanpa mengubah relasi kerja yang lain.</p>
          <form className="design-upload design-manage-form" onSubmit={save} aria-busy={busy === "save"}>
            <input type="hidden" name="expectedUpdatedAt" value={file.updatedAt} />
            <label className="design-upload__wide">
              Nama file
              <input name="originalName" defaultValue={file.originalName} required disabled={busy === "save"} />
              <small>Ekstensi .{file.format} harus tetap sama kecuali sumber diganti.</small>
            </label>
            <label>
              Asal file
              <select name="origin" defaultValue={file.origin} disabled={busy === "save"}>
                <option value="internal">File kerja internal</option>
                <option value="customer">Referensi dari customer</option>
              </select>
            </label>
            <label>
              Jenis file
              <select name="fileKind" defaultValue={file.fileKind} disabled={busy === "save"}>
                <option value="source">File sumber</option>
                <option value="reference">Referensi</option>
                <option value="preview">Preview GLB</option>
              </select>
            </label>
            <label className="design-upload__wide">
              Deskripsi file
              <textarea
                name="description"
                maxLength={1000}
                defaultValue={file.description ?? ""}
                disabled={busy === "save"}
              />
            </label>
            <label>
              Material
              <select name="materialId" defaultValue={file.materialId ?? ""} disabled={busy === "save"}>
                <option value="">Belum ditentukan</option>
                {options.materials.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Customer terkait
              <input
                name="customerLookup"
                list={`design-manage-customers-${listSuffix}`}
                defaultValue={customer?.label ?? ""}
                placeholder="Ketik nama customer"
                autoComplete="off"
                disabled={busy === "save"}
              />
              <datalist id={`design-manage-customers-${listSuffix}`}>
                {options.customers.map((item) => (
                  <option key={item.id} value={item.label} />
                ))}
              </datalist>
            </label>
            <label className="design-upload__wide">
              Tautkan ke (opsional)
              <input
                name="targetLookup"
                list={`design-manage-links-${listSuffix}`}
                defaultValue={target?.label ?? ""}
                placeholder="Ketik nama barang, customer, mould, atau transaksi"
                autoComplete="off"
                disabled={busy === "save"}
              />
              <datalist id={`design-manage-links-${listSuffix}`}>
                {options.links.map((item) => (
                  <option key={`${item.type}:${item.id}`} value={item.label} />
                ))}
              </datalist>
              <small>Bisa ditambahkan nanti.</small>
            </label>
            <label className="design-upload__wide">
              Ganti file sumber, opsional
              <input
                name="file"
                type="file"
                accept=".step,.stp,.iges,.igs,.stl,.obj,.glb,.dwg,.dxf,.prt"
                disabled={busy === "save"}
              />
              <small>Sumber lama dan preview turunannya dihapus setelah penggantian berhasil.</small>
            </label>
            <button type="submit" disabled={busy === "save"}>
              {busy === "save" ? <span className="design-upload__spinner" aria-hidden="true" /> : null}
              <span>{busy === "save" ? "Menyimpan…" : "Simpan perubahan"}</span>
            </button>
          </form>
          {editMessage ? (
            <p className="design-upload__message" data-state="error" role="alert">
              {editMessage}
            </p>
          ) : null}
        </div>
      </dialog>

      {canDelete ? (
        <dialog
          ref={deleteDialogRef}
          id={deleteDialogId}
          className="master-dialog design-delete-dialog"
          data-busy={busy === "delete"}
          onClose={() => {
            setDeleteMessage(null);
            setDeleteName("");
            deleteTriggerRef.current?.focus();
          }}
          onCancel={(event) => {
            if (busy === "delete") event.preventDefault();
          }}
        >
          <form method="dialog" className="master-dialog__close">
            <button type="submit" aria-label="Tutup konfirmasi hapus" disabled={busy === "delete"}>
              ×
            </button>
          </form>
          <div className="master-dialog__body">
            <p className="eyebrow">Hapus file 3D</p>
            <h2>Hapus {file.originalName}?</h2>
            <p>File sumber, thumbnail, dan preview GLB akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.</p>
            <section className="design-danger-zone" aria-labelledby={`delete-title-${listSuffix}`}>
              <h3 id={`delete-title-${listSuffix}`}>Konfirmasi nama file</h3>
              <label>
                Ketik <strong>{file.originalName}</strong>
                <input
                  value={deleteName}
                  onChange={(event) => setDeleteName(event.target.value)}
                  disabled={busy === "delete"}
                  autoComplete="off"
                />
              </label>
              <button type="button" onClick={remove} disabled={busy === "delete" || deleteName !== file.originalName}>
                {busy === "delete" ? <span className="design-upload__spinner" aria-hidden="true" /> : null}
                <span>{busy === "delete" ? "Menghapus…" : "Hapus permanen"}</span>
              </button>
            </section>
            {deleteMessage ? (
              <p className="design-upload__message" data-state="error" role="alert">
                {deleteMessage}
              </p>
            ) : null}
          </div>
        </dialog>
      ) : null}
    </>
  );
}
