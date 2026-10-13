"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createDesignThumbnail } from "@/components/design-thumbnail";

export type DesignLinkOption = { id: string; label: string; type: "product" | "customer" | "mould" | "transaction" };
export type DesignFileOptions = {
  links: DesignLinkOption[];
  customers: { id: string; label: string }[];
  materials: { id: string; label: string }[];
};

export function DesignUploadForm({ options }: { options: DesignFileOptions }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const [message, setMessage] = useState<{ text: string; state: "pending" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    setMessage(null);
    try {
      const designFile = formData.get("file");
      const targetLookup = String(formData.get("targetLookup") ?? "").trim();
      const target = options.links.find((item) => item.label === targetLookup);
      const customerLookup = String(formData.get("customerLookup") ?? "").trim();
      const customer = options.customers.find((item) => item.label === customerLookup);
      if (targetLookup && !target) {
        setMessage({ text: "Pilih tautan kerja dari saran yang tersedia.", state: "error" });
        return;
      }
      if (customerLookup && !customer) {
        setMessage({ text: "Pilih customer dari saran yang tersedia.", state: "error" });
        return;
      }
      if (customer && target?.type === "customer" && target.id !== customer.id) {
        setMessage({
          text: "Customer terkait harus sama dengan customer yang dipilih pada tautan kerja.",
          state: "error",
        });
        return;
      }
      formData.delete("targetLookup");
      formData.delete("customerLookup");
      if (target) formData.set(`${target.type}Id`, target.id);
      if (customer && target?.type !== "customer") formData.set("customerId", customer.id);
      setMessage({ text: "Menyiapkan file…", state: "pending" });
      const thumbnail = designFile instanceof File ? await createDesignThumbnail(designFile) : null;
      setMessage({ text: "Mengunggah file…", state: "pending" });
      const result = await new Promise<{ id?: string; message?: string }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/api/admin/design-files");
        request.responseType = "json";
        request.upload.addEventListener("progress", (uploadEvent) => {
          if (!uploadEvent.lengthComputable) return;
          const value = Math.round((uploadEvent.loaded / uploadEvent.total) * 100);
          setProgress(value);
          setMessage({ text: `Mengunggah file ${value}%`, state: "pending" });
        });
        request.addEventListener("load", () => {
          const body = request.response as { id?: string; message?: string } | null;
          if (request.status < 200 || request.status >= 300)
            reject(new Error(body?.message ?? "File belum dapat diunggah."));
          else resolve(body ?? {});
        });
        request.addEventListener("error", () => reject(new Error("Koneksi terputus saat file diunggah.")));
        request.addEventListener("abort", () => reject(new Error("Upload dibatalkan.")));
        request.send(formData);
      });
      if (thumbnail && result?.id) {
        setMessage({ text: "Menyimpan preview…", state: "pending" });
        const thumbnailData = new FormData();
        thumbnailData.set("thumbnail", thumbnail);
        await fetch(`/api/admin/design-files/${result.id}/thumbnail`, { method: "POST", body: thumbnailData });
      }
      form.reset();
      dialogRef.current?.close();
      router.refresh();
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : "Koneksi terputus. Periksa apakah file sudah tersimpan sebelum mengunggah kembali.",
        state: "error",
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <>
      <button
        className="master-primary-action"
        type="button"
        ref={triggerRef}
        onClick={() => dialogRef.current?.showModal()}
      >
        Unggah file 3D
      </button>
      <dialog
        className="master-dialog design-upload-dialog"
        data-busy={busy}
        ref={dialogRef}
        onClose={() => triggerRef.current?.focus()}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <form method="dialog" className="master-dialog__close">
          <button type="submit" aria-label="Tutup" disabled={busy}>
            ×
          </button>
        </form>
        <div className="master-dialog__body">
          <p className="eyebrow">File privat</p>
          <h2>Unggah file 3D</h2>
          <p>Tambahkan konteks agar file mudah dicari kembali saat produksi.</p>
          <form className="design-upload" onSubmit={submit} aria-busy={busy}>
            <label>
              File desain
              <input
                name="file"
                type="file"
                accept=".step,.stp,.iges,.igs,.stl,.obj,.glb,.dwg,.dxf,.prt"
                required
                disabled={busy}
              />
            </label>
            <label>
              Asal file
              <select name="origin" defaultValue="internal" disabled={busy}>
                <option value="internal">File kerja internal</option>
                <option value="customer">Referensi dari customer</option>
              </select>
            </label>
            <label>
              Jenis file
              <select name="fileKind" defaultValue="source" disabled={busy}>
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
                placeholder="Contoh: Spacer conduit 20 mm, tebal 3 mm, revisi mould A."
                disabled={busy}
              />
            </label>
            <label>
              Material
              <select name="materialId" defaultValue="" disabled={busy}>
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
                list="design-customers"
                placeholder="Ketik nama customer"
                autoComplete="off"
                disabled={busy}
              />
              <datalist id="design-customers">
                {options.customers.map((item) => (
                  <option key={item.id} value={item.label} />
                ))}
              </datalist>
            </label>
            <label className="design-upload__wide">
              Tautkan ke (opsional)
              <input
                name="targetLookup"
                list="design-links"
                placeholder="Ketik nama barang, customer, mould, atau transaksi"
                autoComplete="off"
                disabled={busy}
              />
              <datalist id="design-links">
                {options.links.map((item) => (
                  <option key={`${item.type}:${item.id}`} value={item.label} />
                ))}
              </datalist>
              <small>Bisa ditambahkan nanti.</small>
            </label>
            <button type="submit" disabled={busy}>
              {busy ? <span className="design-upload__spinner" aria-hidden="true" /> : null}
              <span>{busy ? "Mengunggah…" : "Upload"}</span>
            </button>
            {busy && progress !== null ? (
              <progress
                className="design-upload__progress"
                max="100"
                value={progress}
                aria-label={`Upload ${progress}%`}
              />
            ) : null}
            <small>File sumber maksimal 100 MB. Preview STL, OBJ, atau GLB maksimal 25 MB.</small>
            {message ? (
              <p
                className="design-upload__message"
                data-state={message.state}
                role={message.state === "error" ? "alert" : "status"}
                aria-live="polite"
              >
                {message.text}
              </p>
            ) : null}
          </form>
        </div>
      </dialog>
    </>
  );
}
