"use client";

import { useCallback, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveQuoteDraft } from "@/features/operations/workflow-actions";
import { calculateQuote, type QuoteLineInput } from "@/features/operations/quote-math";
import { type QuotationLetter } from "@/features/operations/quotation-letter";
import { useTransactionDraft } from "@/components/use-transaction-draft";

const blankLine = (): QuoteLineInput => ({
  description: "",
  materialLabel: "",
  mouldingLabel: "",
  quantity: "1",
  unit: "pcs",
  unitPrice: "",
  taxRate: "0",
  taxMethod: "none",
  discountKind: "none",
  discountValue: "0",
});
const rupiah = (value: number) => {
  const [whole, fraction] = value.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `Rp ${grouped}${fraction === "00" ? "" : `,${fraction}`}`;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} type="submit">
      {pending ? "Menyimpan…" : "Simpan rincian penawaran"}
    </button>
  );
}

export function TransactionQuoteEditor({
  transactionId,
  initialLines,
  initialTargetDate,
  initialLetter,
  attachments,
  canEditDiscount,
}: {
  transactionId: string;
  initialLines: QuoteLineInput[];
  initialTargetDate: string;
  initialLetter: QuotationLetter;
  attachments: Array<{ id: string; name: string; category: string }>;
  canEditDiscount: boolean;
}) {
  const [lines, setLines] = useState<QuoteLineInput[]>(initialLines.length ? initialLines : [blankLine()]);
  const [letter, setLetter] = useState(initialLetter);
  const [targetDate, setTargetDate] = useState(initialTargetDate);
  const initialDraft = useMemo(
    () => ({
      lines: initialLines.length ? initialLines : [blankLine()],
      letter: initialLetter,
      targetDate: initialTargetDate,
    }),
    [initialLetter, initialLines, initialTargetDate],
  );
  const restoreDraft = useCallback((draft: typeof initialDraft) => {
    setLines(draft.lines);
    setLetter(draft.letter);
    setTargetDate(draft.targetDate);
  }, []);
  const { restored, discard } = useTransactionDraft({
    key: transactionId + ":quote",
    value: { lines, letter, targetDate },
    initial: initialDraft,
    restore: restoreDraft,
  });
  const preview = useMemo(() => {
    try {
      const quote = calculateQuote(lines);
      return {
        gross: Number(quote.gross),
        discount: Number(quote.discount),
        subtotal: Number(quote.subtotal),
        tax: Number(quote.tax),
        total: Number(quote.total),
      };
    } catch {
      // Incomplete inputs still show a useful provisional total while editing.
    }
    const safeNumber = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    };
    const gross = lines.reduce((sum, line) => sum + safeNumber(line.quantity) * safeNumber(line.unitPrice), 0);
    return { gross, discount: 0, subtotal: gross, tax: 0, total: gross };
  }, [lines]);

  function editLine(index: number, key: keyof QuoteLineInput, value: string) {
    setLines((current) => current.map((line, position) => (position === index ? { ...line, [key]: value } : line)));
  }

  return (
    <form action={saveQuoteDraft} className="transaction-quote-editor">
      <input name="transactionId" type="hidden" value={transactionId} />
      <input name="lines" type="hidden" value={JSON.stringify(lines)} />
      <input name="letter" type="hidden" value={JSON.stringify(letter)} />
      {restored ? (
        <div className="transaction-draft-restored" role="status">
          <span>Draft belum disimpan dipulihkan.</span>
          <button onClick={discard} type="button">
            Buang draft
          </button>
        </div>
      ) : null}
      <div className="transaction-quote-editor__heading">
        <div>
          <p className="eyebrow">Isi penawaran</p>
          <h3>Barang atau jasa</h3>
          <p>Tulis kebutuhan pelanggan. Harga belum termasuk pajak.</p>
        </div>
      </div>
      <div className="transaction-quote-editor__lines">
        {lines.map((line, index) => (
          <fieldset className="transaction-quote-editor__line" key={index}>
            <legend>Item {index + 1}</legend>
            <label className="transaction-quote-editor__description">
              Barang / jasa
              <input
                maxLength={500}
                onChange={(event) => editLine(index, "description", event.target.value)}
                placeholder="mis. Spacer conduit"
                required
                value={line.description}
              />
            </label>
            <label>
              Material
              <input
                maxLength={160}
                onChange={(event) => editLine(index, "materialLabel", event.target.value)}
                placeholder="mis. PP hitam"
                value={line.materialLabel ?? ""}
              />
            </label>
            <label>
              Moulding
              <input
                maxLength={160}
                onChange={(event) => editLine(index, "mouldingLabel", event.target.value)}
                placeholder="mis. Tersedia"
                value={line.mouldingLabel ?? ""}
              />
            </label>
            <label>
              Jumlah
              <input
                inputMode="decimal"
                onChange={(event) => editLine(index, "quantity", event.target.value)}
                pattern="[0-9]+([.][0-9]{1,3})?"
                required
                value={line.quantity}
              />
            </label>
            <label>
              Satuan
              <input
                maxLength={16}
                onChange={(event) => editLine(index, "unit", event.target.value)}
                required
                value={line.unit}
              />
            </label>
            <label>
              Harga per satuan (Rp)
              <input
                inputMode="decimal"
                onChange={(event) => editLine(index, "unitPrice", event.target.value)}
                pattern="[0-9]+([.][0-9]{1,2})?"
                placeholder="mis. 15000"
                required
                value={line.unitPrice}
              />
            </label>
            <div className="transaction-quote-editor__line-total">
              <span>Total price</span>
              <strong>{rupiah((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))}</strong>
            </div>
            <label>
              Diskon
              <select
                disabled={!canEditDiscount}
                onChange={(event) => editLine(index, "discountKind", event.target.value)}
                value={line.discountKind ?? "none"}
              >
                <option value="none">Tanpa diskon</option>
                <option value="amount">Nominal (Rp)</option>
                <option value="percent">Persentase (%)</option>
              </select>
            </label>
            {(line.discountKind ?? "none") !== "none" ? (
              <label>
                {line.discountKind === "percent" ? "Diskon (%)" : "Diskon (Rp)"}
                <input
                  disabled={!canEditDiscount}
                  inputMode="decimal"
                  onChange={(event) => editLine(index, "discountValue", event.target.value)}
                  pattern="[0-9]+([.][0-9]{1,2})?"
                  required
                  value={line.discountValue ?? "0"}
                />
              </label>
            ) : null}
            {!canEditDiscount && (line.discountKind ?? "none") !== "none" ? (
              <small>Perubahan diskon hanya dapat dilakukan administrator.</small>
            ) : null}
            <label>
              Metode pajak
              <select
                onChange={(event) => {
                  const method = event.target.value as QuoteLineInput["taxMethod"];
                  setLines((current) =>
                    current.map((item, position) =>
                      position === index
                        ? { ...item, taxMethod: method, taxRate: method === "none" ? "0" : "12" }
                        : item,
                    ),
                  );
                }}
                value={line.taxMethod ?? "legacy"}
              >
                <option value="none">Tanpa PPN</option>
                <option value="dpp_11_12">PPN 12% × DPP 11/12</option>
                <option value="standard">PPN 12% × harga bersih</option>
                <option disabled value="legacy">
                  Tarif lama, perlu ditinjau
                </option>
              </select>
            </label>
            {(line.taxMethod ?? "legacy") === "legacy" ? (
              <p className="transaction-quote-editor__legacy">Pilih metode pajak baru sebelum menyimpan perubahan.</p>
            ) : null}
            {lines.length > 1 ? (
              <button
                aria-label={`Hapus item ${index + 1}`}
                className="transaction-quote-editor__remove"
                onClick={() => setLines((current) => current.filter((_, position) => position !== index))}
                type="button"
              >
                Hapus item
              </button>
            ) : null}
          </fieldset>
        ))}
      </div>
      <button
        className="transaction-quote-editor__add"
        disabled={lines.length >= 30}
        onClick={() => setLines((current) => [...current, blankLine()])}
        type="button"
      >
        + Tambah barang / jasa
      </button>
      <fieldset className="transaction-quote-editor__letter">
        <legend>Surat dan syarat</legend>
        <p>Sesuaikan syarat untuk pelanggan. Perubahan masuk ke PDF berikutnya.</p>
        <label>
          Perihal surat
          <input
            maxLength={220}
            onChange={(event) => setLetter((current) => ({ ...current, subject: event.target.value }))}
            required
            value={letter.subject}
          />
        </label>
        <div className="transaction-quote-editor__letter-grid">
          <label>
            PIC pelanggan
            <input
              maxLength={120}
              onChange={(event) => setLetter((current) => ({ ...current, recipientPic: event.target.value }))}
              value={letter.recipientPic}
            />
          </label>
          <label>
            Berlaku sampai
            <input
              onChange={(event) => setLetter((current) => ({ ...current, validUntil: event.target.value }))}
              type="date"
              value={letter.validUntil}
            />
          </label>
        </div>
        <label>
          Alamat penerima surat
          <textarea
            maxLength={700}
            onChange={(event) => setLetter((current) => ({ ...current, recipientAddress: event.target.value }))}
            rows={2}
            value={letter.recipientAddress}
          />
        </label>
        {(
          [
            ["freightTerms", "Ongkos kirim"],
            ["paymentTerms", "Cara pembayaran"],
            ["leadTime", "Waktu pengerjaan"],
            ["notes", "Catatan lain"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <textarea
              maxLength={key === "notes" ? 2500 : 700}
              onChange={(event) => setLetter((current) => ({ ...current, [key]: event.target.value }))}
              rows={2}
              value={letter[key]}
            />
          </label>
        ))}
        <div className="transaction-quote-editor__attachments">
          <strong>Lampiran PDF ini (opsional)</strong>
          {attachments.length ? (
            attachments.map((attachment) => (
              <label key={attachment.id}>
                <input
                  checked={letter.attachmentIds.includes(attachment.id)}
                  onChange={(event) =>
                    setLetter((current) => ({
                      ...current,
                      attachmentIds: event.target.checked
                        ? [...current.attachmentIds, attachment.id]
                        : current.attachmentIds.filter((id) => id !== attachment.id),
                    }))
                  }
                  type="checkbox"
                />
                {attachment.name} · {attachment.category}
              </label>
            ))
          ) : (
            <p>Belum ada lampiran. Unggah foto, drawing, atau spesifikasi di bagian bawah.</p>
          )}
        </div>
      </fieldset>
      <div className="transaction-quote-editor__bottom">
        <label>
          Target pekerjaan
          <input
            name="targetDate"
            onChange={(event) => setTargetDate(event.target.value)}
            type="date"
            value={targetDate}
          />
        </label>
        <dl className="transaction-quote-editor__totals" aria-live="polite">
          <div>
            <dt>Total harga</dt>
            <dd>{rupiah(preview.gross)}</dd>
          </div>
          <div>
            <dt>Diskon</dt>
            <dd>-{rupiah(preview.discount)}</dd>
          </div>
          <div>
            <dt>Nilai barang / jasa</dt>
            <dd>{rupiah(preview.subtotal)}</dd>
          </div>
          <div>
            <dt>Pajak</dt>
            <dd>{rupiah(preview.tax)}</dd>
          </div>
          <div>
            <dt>Total penawaran</dt>
            <dd>{rupiah(preview.total)}</dd>
          </div>
        </dl>
      </div>
      <p className="transaction-quote-editor__hint">
        Simpan dulu sebelum membuat PDF. Menyimpan tidak otomatis mengirim penawaran.
      </p>
      <SaveButton />
    </form>
  );
}
