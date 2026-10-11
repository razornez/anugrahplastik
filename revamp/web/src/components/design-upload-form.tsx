"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createDesignThumbnail } from "@/components/design-thumbnail";

type LinkOption = { id: string; label: string; type: "product" | "customer" | "mould" | "transaction" };
type Options = {
  links: LinkOption[];
  customers: { id: string; label: string }[];
  materials: { id: string; label: string }[];
};

export function DesignUploadForm({ options }: { options: Options }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (formData: FormData) => {
    setBusy(true);
    setMessage(null);
    const designFile = formData.get("file");
    const targetLookup = String(formData.get("targetLookup") ?? "").trim();
    const target = options.links.find((item) => item.label === targetLookup);
    const customerLookup = String(formData.get("customerLookup") ?? "").trim();
    const customer = options.customers.find((item) => item.label === customerLookup);
    if (!target) {
      setMessage("Pilih barang, customer, mould, atau transaksi untuk menautkan file.");
      setBusy(false);
      return;
    }
    if (customerLookup && !customer) {
      setMessage("Pilih customer dari saran yang tersedia.");
      setBusy(false);
      return;
    }
    if (customer && target.type === "customer" && target.id !== customer.id) {
      setMessage("Customer terkait harus sama dengan customer yang dipilih pada tautan kerja.");
      setBusy(false);
      return;
    }
    formData.delete("targetLookup");
    formData.delete("customerLookup");
    formData.set(`${target.type}Id`, target.id);
    if (customer && target.type !== "customer") formData.set("customerId", customer.id);
    setMessage(designFile instanceof File ? "Menyiapkan file dan preview…" : null);
    const thumbnail = designFile instanceof File ? await createDesignThumbnail(designFile) : null;
    const response = await fetch("/api/admin/design-files", { method: "POST", body: formData });
    const result = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!response.ok) {
      setMessage(result?.message ?? "File belum dapat diunggah.");
      setBusy(false);
      return;
    }
    if (thumbnail && result?.id) {
      const thumbnailData = new FormData();
      thumbnailData.set("thumbnail", thumbnail);
      await fetch(`/api/admin/design-files/${result.id}/thumbnail`, { method: "POST", body: thumbnailData });
    }
    setBusy(false);
    dialogRef.current?.close();
    router.refresh();
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
        ref={dialogRef}
        onClose={() => triggerRef.current?.focus()}
      >
        <form method="dialog" className="master-dialog__close">
          <button type="submit" aria-label="Tutup">
            ×
          </button>
        </form>
        <div className="master-dialog__body">
          <p className="eyebrow">File privat</p>
          <h2>Unggah file 3D</h2>
          <p>Tambahkan konteks agar file mudah dicari kembali saat produksi.</p>
          <form className="design-upload" action={submit}>
            <label>
              File desain
              <input name="file" type="file" accept=".step,.stp,.iges,.igs,.stl,.obj,.glb,.dwg,.dxf,.prt" required />
            </label>
            <label>
              Asal file
              <select name="origin" defaultValue="internal">
                <option value="internal">File kerja internal</option>
                <option value="customer">Referensi dari customer</option>
              </select>
            </label>
            <label>
              Jenis file
              <select name="fileKind" defaultValue="source">
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
              />
            </label>
            <label>
              Material
              <select name="materialId" defaultValue="">
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
              />
              <datalist id="design-customers">
                {options.customers.map((item) => (
                  <option key={item.id} value={item.label} />
                ))}
              </datalist>
            </label>
            <label className="design-upload__wide">
              Tautkan ke
              <input
                name="targetLookup"
                list="design-links"
                placeholder="Ketik nama barang, customer, mould, atau transaksi"
                autoComplete="off"
                required
                disabled={!options.links.length || busy}
              />
              <datalist id="design-links">
                {options.links.map((item) => (
                  <option key={`${item.type}:${item.id}`} value={item.label} />
                ))}
              </datalist>
            </label>
            <button type="submit" disabled={busy || !options.links.length}>
              {busy ? "Menyimpan…" : "Upload privat"}
            </button>
            <small>File sumber maksimal 100 MB. Preview STL, OBJ, atau GLB maksimal 25 MB.</small>
            {message ? <p role="status">{message}</p> : null}
          </form>
        </div>
      </dialog>
    </>
  );
}
