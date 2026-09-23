"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LinkOption = { id: string; label: string; type: "product" | "customer" | "mould" };

export function DesignUploadForm({ options }: { options: LinkOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (formData: FormData) => {
    setBusy(true);
    setMessage(null);
    const target = String(formData.get("target") ?? "");
    const [type, id] = target.split(":");
    if (!id || !["product", "customer", "mould"].includes(type)) {
      setMessage("Pilih barang, customer, atau mould untuk menautkan file.");
      setBusy(false);
      return;
    }
    formData.delete("target");
    formData.set(`${type}Id`, id);
    const response = await fetch("/api/admin/design-files", { method: "POST", body: formData });
    const result = (await response.json().catch(() => null)) as { message?: string; capacityWarning?: boolean } | null;
    if (!response.ok) {
      setMessage(result?.message ?? "File belum dapat diunggah.");
      setBusy(false);
      return;
    }
    setMessage(
      result?.capacityWarning ? "File tersimpan. Kapasitas mulai mendekati batas aman." : "File tersimpan privat.",
    );
    setBusy(false);
    router.refresh();
  };

  return (
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
      <label>
        Tautkan ke
        <select name="target" required defaultValue="">
          <option value="" disabled>
            Pilih tujuan
          </option>
          {options.map((item) => (
            <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Menyimpan…" : "Upload privat"}
      </button>
      <small>File sumber maksimal 100 MB. Preview STL, OBJ, atau GLB maksimal 25 MB.</small>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
