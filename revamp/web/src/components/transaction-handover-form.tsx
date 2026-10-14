"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { generateHandoverNote } from "@/features/operations/workflow-actions";
import type { HandoverDetails } from "@/features/operations/handover-note";

type Line = { lineId: string; description: string; quantity: string; unit: string };
const quantityFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

export function TransactionHandoverForm({
  transactionId,
  shipmentId,
  lines,
  initial,
  latestReady,
  latestNumber,
  hasProof,
  isAdmin,
  enabled,
}: {
  transactionId: string;
  shipmentId: string;
  lines: Line[];
  initial: HandoverDetails;
  latestReady: boolean;
  latestNumber: string | null;
  hasProof: boolean;
  isAdmin: boolean;
  enabled: boolean;
}) {
  const router = useRouter();
  const [details, setDetails] = useState(initial);
  const [source, setSource] = useState<"app" | "external">(latestReady ? "app" : "external");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const set = <K extends keyof HandoverDetails>(key: K, value: HandoverDetails[K]) =>
    setDetails((current) => ({ ...current, [key]: value }));

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = event.currentTarget;
    const body = new FormData(form);
    body.set("type", "bast_signed");
    body.set("shipmentId", shipmentId);
    body.set("receiptSource", source);
    body.set("receipt", JSON.stringify(details));
    if (source === "app" && latestNumber) body.set("documentNo", latestNumber);
    try {
      const response = await fetch(`/api/admin/transactions/${transactionId}/documents`, {
        method: "POST",
        body,
        cache: "no-store",
      });
      const result = (await response.json()) as { error?: string; message?: string };
      setMessage(result.error ?? result.message ?? "Bukti belum dapat disimpan.");
      if (response.ok) {
        form.reset();
        router.refresh();
      }
    } catch {
      setMessage("Koneksi terputus. Periksa apakah bukti sudah tersimpan sebelum mencoba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="transaction-flow-stack">
      <form action={generateHandoverNote} className="transaction-flow-form">
        <p>
          Catat jumlah yang benar-benar diterima. Surat jalan tidak akan berubah. PDF STB belum merupakan bukti serah
          terima sampai salinan bertanda tangan diunggah.
        </p>
        <label>
          Nama penerima
          <input
            value={details.recipient}
            onChange={(event) => set("recipient", event.target.value)}
            minLength={2}
            maxLength={160}
            required
          />
        </label>
        <label>
          Lokasi penerimaan
          <textarea
            value={details.location}
            onChange={(event) => set("location", event.target.value)}
            minLength={5}
            maxLength={1000}
            required
            rows={2}
          />
        </label>
        {lines.map((line) => (
          <label key={line.lineId}>
            {line.description} · dikirim {quantityFormatter.format(Number(line.quantity))} {line.unit} · diterima
            <input
              type="number"
              min="0"
              max={line.quantity}
              step="0.001"
              value={details.items.find((item) => item.lineId === line.lineId)?.accepted ?? "0"}
              onChange={(event) =>
                set(
                  "items",
                  details.items.map((item) =>
                    item.lineId === line.lineId ? { ...item, accepted: event.target.value } : item,
                  ),
                )
              }
              required
            />
          </label>
        ))}
        <label>
          Kondisi barang
          <select
            value={details.condition}
            onChange={(event) => set("condition", event.target.value as HandoverDetails["condition"])}
          >
            <option value="good">Sesuai</option>
            <option value="partial">Diterima sebagian</option>
            <option value="damaged">Ada kerusakan</option>
          </select>
        </label>
        <label>
          Catatan penerimaan (wajib jika kurang/rusak)
          <textarea
            value={details.note}
            onChange={(event) => set("note", event.target.value)}
            minLength={8}
            maxLength={1500}
            required={
              details.condition !== "good" ||
              details.items.some(
                (item) =>
                  Number(item.accepted) < Number(lines.find((line) => line.lineId === item.lineId)?.quantity ?? 0),
              )
            }
            rows={3}
          />
        </label>
        <label>
          Nama pihak yang menyerahkan (opsional)
          <input
            value={details.senderName}
            onChange={(event) => set("senderName", event.target.value)}
            maxLength={120}
          />
        </label>
        <label>
          Nama supir (opsional)
          <input
            value={details.driverName}
            onChange={(event) => set("driverName", event.target.value)}
            maxLength={120}
          />
        </label>
        <label>
          Nama penerima untuk kolom tanda tangan (opsional)
          <input
            value={details.receiverName}
            onChange={(event) => set("receiverName", event.target.value)}
            maxLength={120}
          />
        </label>
        <input name="shipmentId" type="hidden" value={shipmentId} />
        <input name="details" type="hidden" value={JSON.stringify(details)} />
        {!hasProof ? (
          <>
            <button disabled={!enabled} type="submit">
              {latestReady ? "Buat revisi PDF" : "Terbitkan PDF"}
            </button>
            {!enabled ? (
              <small>Template STB contoh belum diverifikasi. Bukti dari luar aplikasi tetap bisa diunggah.</small>
            ) : null}
          </>
        ) : null}
      </form>
      {!hasProof || isAdmin ? (
        <form className="transaction-upload" onSubmit={upload}>
          <strong>{hasProof ? "Ganti bukti bertanda tangan" : "Simpan bukti bertanda tangan"}</strong>
          <p>
            Pilih PDF atau foto dokumen yang sudah benar-benar ditandatangani. Angka dan kondisi di atas akan dikunci
            bersama bukti.
          </p>
          <label>
            Sumber dokumen
            <select value={source} onChange={(event) => setSource(event.target.value as "app" | "external")}>
              {latestReady ? <option value="app">STB aplikasi (terbaru)</option> : null}
              <option value="external">Dokumen dari luar aplikasi</option>
            </select>
          </label>
          {source === "external" ? (
            <label>
              Nomor dokumen luar (jika ada)
              <input name="documentNo" maxLength={100} />
            </label>
          ) : null}
          {hasProof ? (
            <label>
              Alasan penggantian bukti
              <textarea name="supersedeReason" minLength={8} maxLength={500} required rows={2} />
            </label>
          ) : null}
          <label>
            PDF atau foto yang sudah ditandatangani
            <input
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              name="file"
              required
              type="file"
            />
          </label>
          <button disabled={pending} type="submit">
            {pending ? "Menyimpan…" : "Simpan bukti penerimaan"}
          </button>
          {message ? (
            <p aria-live="polite" role="status">
              {message}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
