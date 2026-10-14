"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { restoreDocumentTemplate, saveDocumentTemplate } from "@/features/operations/document-settings-actions";
import { documentTemplateLabels, type DocumentTemplateKind } from "@/features/operations/document-template-shared";

type Field = { name: string; label: string; kind?: "number" | "textarea"; hint?: string };

const fields: Record<DocumentTemplateKind, Field[]> = {
  quotation: [
    { name: "title", label: "Judul dokumen" },
    { name: "opening", label: "Teks pembuka", kind: "textarea" },
    { name: "validityDays", label: "Masa berlaku default (hari)", kind: "number" },
    { name: "freight", label: "Ongkos kirim", kind: "textarea" },
    { name: "payment", label: "Cara pembayaran", kind: "textarea" },
    { name: "leadTime", label: "Waktu pengerjaan", kind: "textarea" },
    { name: "notes", label: "Catatan default", kind: "textarea" },
    { name: "signatureLabel", label: "Label tanda tangan" },
    { name: "footer", label: "Footer", kind: "textarea" },
  ],
  invoice: [
    { name: "title", label: "Judul dokumen" },
    { name: "opening", label: "Teks pembuka", kind: "textarea" },
    { name: "paymentTerms", label: "Syarat pembayaran", kind: "textarea" },
    { name: "footerNote", label: "Catatan footer", kind: "textarea" },
    { name: "signatureLabel", label: "Label tanda tangan" },
    { name: "footer", label: "Footer", kind: "textarea" },
  ],
  delivery: [
    { name: "title", label: "Judul dokumen" },
    { name: "opening", label: "Teks pembuka", kind: "textarea" },
    { name: "receiptInstruction", label: "Instruksi penerimaan", kind: "textarea" },
    { name: "notes", label: "Catatan default", kind: "textarea" },
    { name: "signatureLabel", label: "Label tanda tangan" },
    { name: "footer", label: "Footer", kind: "textarea" },
  ],
  handover: [
    { name: "title", label: "Judul dokumen" },
    { name: "opening", label: "Teks pembuka", kind: "textarea" },
    { name: "acceptanceStatement", label: "Pernyataan penerimaan", kind: "textarea" },
    { name: "conditionNotes", label: "Catatan kondisi default", kind: "textarea" },
    { name: "signatureLabel", label: "Label tanda tangan" },
    { name: "footer", label: "Footer", kind: "textarea" },
  ],
};

type Version = { id: string; version: number; status: string; createdAt: Date; activatedAt: Date | null };

function PendingButton({ idle, pendingLabel }: { idle: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button aria-busy={pending} disabled={pending} type="submit">
      {pending ? pendingLabel : idle}
    </button>
  );
}

export function DocumentTemplateEditor({
  kind,
  initial,
  activeVersion,
  versions,
  error,
}: {
  kind: DocumentTemplateKind;
  initial: Record<string, string | number>;
  activeVersion?: number;
  versions: Version[];
  error?: string | null;
}) {
  const [values, setValues] = useState(initial);
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const summary = useMemo(
    () =>
      fields[kind]
        .filter((field) => !["title", "opening", "footer", "signatureLabel"].includes(field.name))
        .slice(0, 3),
    [kind],
  );
  return (
    <div className="document-template-editor-layout">
      <form action={saveDocumentTemplate} className="document-template-editor-form">
        <input name="kind" type="hidden" value={kind} />
        <header>
          <div>
            <span>DOKUMEN PDF</span>
            <h2>{documentTemplateLabels[kind]}</h2>
            <p>{activeVersion ? `Versi ${activeVersion} aktif` : "Belum memiliki versi aktif"}</p>
          </div>
          <Link href="/admin/settings/documents#identity">Edit identitas penerbit</Link>
        </header>
        <div className="document-template-locked-note">
          <strong>Struktur dokumen dilindungi</strong>
          <span>Tabel, perhitungan, nomor, watermark, dan variabel sistem tidak dapat diubah.</span>
        </div>
        <div className="document-template-fields">
          {fields[kind].map((field) => (
            <label key={field.name}>
              {field.label}
              {field.kind === "textarea" ? (
                <textarea
                  name={field.name}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  required={!field.name.toLowerCase().includes("note")}
                  rows={2}
                  value={String(values[field.name] ?? "")}
                />
              ) : (
                <input
                  max={field.kind === "number" ? 365 : undefined}
                  min={field.kind === "number" ? 1 : undefined}
                  name={field.name}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  required
                  type={field.kind === "number" ? "number" : "text"}
                  value={String(values[field.name] ?? "")}
                />
              )}
            </label>
          ))}
        </div>
        <div className="document-template-savebar">
          {error ? (
            <p className="integration-error" role="alert">
              {error}
            </p>
          ) : null}
          <span>Simpan akan membuat versi baru dan mengaktifkannya setelah smoke render berhasil.</span>
          <PendingButton idle="Simpan dan aktifkan" pendingLabel="Memeriksa PDF…" />
        </div>
      </form>

      <aside className="document-template-preview-column">
        <header>
          <div>
            <strong>Pratinjau</strong>
            <span>Data anonim · hanya preview</span>
          </div>
          <div className="document-preview-switch" role="group" aria-label="Ukuran pratinjau">
            <button aria-pressed={preview === "desktop"} onClick={() => setPreview("desktop")} type="button">
              Desktop
            </button>
            <button aria-pressed={preview === "mobile"} onClick={() => setPreview("mobile")} type="button">
              Mobile
            </button>
          </div>
        </header>
        <div className="document-template-preview-frame" data-size={preview}>
          <article>
            <div className="document-preview-brand">
              <span>AP</span>
              <strong>
                ANUGRAH PLASTIK<small>Dokumen resmi</small>
              </strong>
            </div>
            <p className="document-preview-no">
              No. {kind === "invoice" ? "INV" : kind === "delivery" ? "SJ" : kind === "handover" ? "STB" : "SP"}
              /AMB/001/X/2026
            </p>
            <h3>{String(values.title ?? "")}</h3>
            <p>{String(values.opening ?? "")}</p>
            <dl>
              <div>
                <dt>Pelanggan</dt>
                <dd>PT Pelanggan Contoh</dd>
              </div>
              <div>
                <dt>Tanggal</dt>
                <dd>14 Oktober 2026</dd>
              </div>
            </dl>
            <table>
              <thead>
                <tr>
                  <th>Uraian</th>
                  <th>Jumlah</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Produk plastik contoh</td>
                  <td>100 pcs</td>
                  <td>Rp1.500.000</td>
                </tr>
              </tbody>
            </table>
            {summary.map((field) => (
              <p className="document-preview-term" key={field.name}>
                <strong>{field.label}</strong>
                {String(values[field.name] ?? "Belum tersedia")}
              </p>
            ))}
            <div className="document-preview-signature">
              <span>{String(values.signatureLabel ?? "")}</span>
              <strong>Nama penanda tangan</strong>
            </div>
            <footer>{String(values.footer ?? "")}</footer>
          </article>
        </div>
        {versions.length ? (
          <details className="document-template-history">
            <summary>Riwayat versi ({versions.length})</summary>
            <div>
              {versions.map((version) => (
                <div key={version.id}>
                  <span>
                    Versi {version.version}
                    <small>
                      {version.status === "active" ? "Aktif" : version.status === "failed" ? "Gagal" : "Riwayat"}
                    </small>
                  </span>
                  {version.version !== activeVersion && version.status !== "failed" ? (
                    <form action={restoreDocumentTemplate}>
                      <input name="versionId" type="hidden" value={version.id} />
                      <PendingButton idle="Pulihkan" pendingLabel="Memulihkan…" />
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </aside>
    </div>
  );
}
