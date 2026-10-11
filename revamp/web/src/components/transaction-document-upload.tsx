"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function TransactionDocumentUpload({
  transactionId,
  type,
  label,
  hint,
  shipmentId,
}: {
  transactionId: string;
  type: "purchase_order" | "payment_proof" | "tax_invoice" | "bast_signed" | "quotation_attachment";
  label: string;
  hint: string;
  shipmentId?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = event.currentTarget;
    const body = new FormData(form);
    body.set("type", type);
    try {
      const response = await fetch(`/api/admin/transactions/${transactionId}/documents`, {
        method: "POST",
        body,
        cache: "no-store",
      });
      const result = (await response.json()) as { error?: string; message?: string };
      setMessage(result.error ?? result.message ?? "Dokumen belum dapat disimpan.");
      if (response.ok) {
        form.reset();
        router.refresh();
      }
    } catch {
      setMessage("Koneksi terputus. Periksa apakah dokumen sudah tersimpan sebelum mengulang.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="transaction-upload" onSubmit={submit}>
      <strong>{label}</strong>
      <p>{hint}</p>
      {shipmentId ? <input name="shipmentId" type="hidden" value={shipmentId} /> : null}
      {type === "quotation_attachment" ? (
        <>
          <label>
            Jenis lampiran
            <select name="category" required>
              <option value="Foto produk">Foto produk</option>
              <option value="Drawing">Drawing</option>
              <option value="Spesifikasi">Spesifikasi</option>
            </select>
          </label>
          <label>
            Keterangan singkat
            <input maxLength={160} name="caption" placeholder="Contoh: Drawing spacer 8 inci" required />
          </label>
        </>
      ) : null}
      {type !== "quotation_attachment" ? (
        <label>
          Nomor dokumen (jika ada)
          <input maxLength={100} name="documentNo" placeholder="Contoh: PO-123" />
        </label>
      ) : null}
      <label>
        Pilih berkas PDF atau foto
        <input accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" name="file" required type="file" />
      </label>
      <button disabled={pending} type="submit">
        {pending ? "Mengunggah…" : "Simpan dokumen"}
      </button>
      {message ? (
        <p aria-live="polite" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
