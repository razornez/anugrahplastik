"use client";

import { useMemo, useState } from "react";
import {
  calculateDeliveryInvoice,
  calculateDpInvoice,
  moneyCents,
  type InvoiceQuantity,
  type InvoiceSourceLine,
} from "@/features/operations/invoice-math";
import { createTransactionInvoice } from "@/features/operations/workflow-actions";
import { centsText } from "@/features/operations/quote-math";

type IssuedInvoice = {
  kind: string;
  amount: string;
  dpApplied: string;
  snapshot: unknown;
  shipmentId: string | null;
};

type Shipment = { id: string; referenceNo: string; status: string; items: InvoiceQuantity[] };

const rupiah = (value: string | number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 }).format(
    Number(value),
  );
const dpTerms = "Pembayaran sesuai tanggal jatuh tempo pada invoice ini.";
const finalTerms = "Pelunasan setelah pengiriman, maksimal 14 hari sejak invoice dan dokumen serah terima diterima.";

export function TransactionInvoiceForm(props: {
  transactionId: string;
  lines: InvoiceSourceLine[];
  invoices: IssuedInvoice[];
  shipments: Shipment[];
  verifiedPayments: string;
  customerName: string;
  customerAddress: string;
  poNumber: string;
  canGenerate: boolean;
}) {
  const [kind, setKind] = useState<"dp" | "final">("dp");
  const [amount, setAmount] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [dpApplied, setDpApplied] = useState("0");
  const [terms, setTerms] = useState(dpTerms);
  const preview = useMemo(() => {
    try {
      if (props.lines.some((line) => line.taxMethod === "legacy")) {
        throw new Error("Metode pajak lama perlu ditinjau dahulu di langkah Penawaran.");
      }
      if (kind === "dp") return amount ? calculateDpInvoice(props.lines, amount) : null;
      const shipment = props.shipments.find((item) => item.id === shipmentId);
      if (!shipment) return null;
      const snapshots = props.invoices.map(
        (invoice) =>
          invoice.snapshot as {
            kind?: string;
            lines?: InvoiceQuantity[];
            dpp?: string;
            tax?: string;
          } | null,
      );
      const sum = (values: string[]) =>
        centsText(values.reduce((total, value) => total + moneyCents(value), BigInt(0)));
      const dpInvoices = props.invoices.filter((invoice) => invoice.kind === "dp");
      return calculateDeliveryInvoice({
        lines: props.lines,
        shipment: shipment.items,
        previouslyBilled: snapshots.flatMap((snapshot) => (snapshot?.kind === "final" ? (snapshot.lines ?? []) : [])),
        dpApplied,
        priorDpApplied: sum(props.invoices.map((invoice) => invoice.dpApplied)),
        dpIssued: sum(dpInvoices.map((invoice) => invoice.amount)),
        dpDpp: sum(snapshots.filter((snapshot) => snapshot?.kind === "dp").map((snapshot) => snapshot?.dpp ?? "0")),
        dpTax: sum(snapshots.filter((snapshot) => snapshot?.kind === "dp").map((snapshot) => snapshot?.tax ?? "0")),
        verifiedPayments: props.verifiedPayments,
      });
    } catch (error) {
      return error instanceof Error ? error.message : "Perhitungan belum tersedia.";
    }
  }, [kind, amount, shipmentId, dpApplied, props.lines, props.shipments, props.invoices, props.verifiedPayments]);
  const ready = !!preview && typeof preview !== "string";
  return (
    <form action={createTransactionInvoice} className="transaction-flow-form transaction-invoice-form">
      <input name="transactionId" type="hidden" value={props.transactionId} />
      <label>
        Jenis tagihan
        <select
          name="kind"
          onChange={(event) => {
            const next = event.target.value as "dp" | "final";
            setKind(next);
            setTerms((current) =>
              current === dpTerms || current === finalTerms ? (next === "dp" ? dpTerms : finalTerms) : current,
            );
          }}
          value={kind}
        >
          <option value="dp">Uang muka (DP)</option>
          <option value="final">Barang yang sudah dikirim</option>
        </select>
      </label>
      {kind === "dp" ? (
        <label>
          Jumlah uang muka (Rp)
          <input
            min="0.01"
            name="amount"
            onChange={(event) => setAmount(event.target.value)}
            required
            step="0.01"
            type="number"
            value={amount}
          />
        </label>
      ) : (
        <>
          <label>
            Pengiriman yang ditagih
            <select
              name="shipmentId"
              onChange={(event) => setShipmentId(event.target.value)}
              required
              value={shipmentId}
            >
              <option value="">Pilih pengiriman</option>
              {props.shipments.map((shipment) => (
                <option key={shipment.id} value={shipment.id}>
                  {shipment.referenceNo}
                </option>
              ))}
            </select>
          </label>
          <label>
            DP terverifikasi yang diterapkan (Rp)
            <input
              min="0"
              name="dpApplied"
              onChange={(event) => setDpApplied(event.target.value)}
              required
              step="0.01"
              type="number"
              value={dpApplied}
            />
          </label>
        </>
      )}
      {kind === "dp" ? <input name="dpApplied" type="hidden" value="0" /> : null}
      <label>
        Jatuh tempo
        <input name="dueDate" required type="date" />
      </label>
      <label>
        Syarat pembayaran
        <textarea
          maxLength={800}
          minLength={8}
          name="paymentTerms"
          onChange={(event) => setTerms(event.target.value)}
          required
          rows={2}
          value={terms}
        />
      </label>
      <div className="transaction-invoice-preview" aria-live="polite">
        <strong>Periksa sebelum membuat PDF</strong>
        <p>
          <b>Pelanggan:</b> {props.customerName} · <b>PO:</b> {props.poNumber || "Nomor belum dicantumkan"}
        </p>
        {!props.customerAddress ? (
          <p className="transaction-flow-warning">Alamat penagihan pelanggan belum dilengkapi.</p>
        ) : null}
        {typeof preview === "string" ? (
          <p className="transaction-flow-warning">{preview}</p>
        ) : preview ? (
          <dl>
            <div>
              <dt>Total harga</dt>
              <dd>{rupiah(preview.gross)}</dd>
            </div>
            <div>
              <dt>Diskon</dt>
              <dd>−{rupiah(preview.discount)}</dd>
            </div>
            <div>
              <dt>{preview.kind === "dp" ? "Dasar DP sebelum PPN" : "Nilai barang setelah diskon"}</dt>
              <dd>{rupiah(preview.goodsSubtotal)}</dd>
            </div>
            <div>
              <dt>PPN barang / DP</dt>
              <dd>{rupiah(preview.goodsTax)}</dd>
            </div>
            <div>
              <dt>Total sebelum penerapan DP</dt>
              <dd>{rupiah(preview.goodsTotal)}</dd>
            </div>
            <div>
              <dt>DP diterapkan</dt>
              <dd>−{rupiah(preview.dpApplied)}</dd>
            </div>
            <div className="transaction-invoice-preview__due">
              <dt>Jumlah harus dibayar</dt>
              <dd>{rupiah(preview.amountDue)}</dd>
            </div>
            <div>
              <dt>DPP nilai lain tagihan ini</dt>
              <dd>{rupiah(preview.dpp)}</dd>
            </div>
            <div>
              <dt>PPN tagihan ini setelah DP</dt>
              <dd>{rupiah(preview.tax)}</dd>
            </div>
          </dl>
        ) : (
          <p>Isi jumlah DP atau pilih pengiriman untuk melihat angka tagihan.</p>
        )}
      </div>
      <label className="transaction-invoice-confirm">
        <input name="taxConfirmed" required type="checkbox" value="yes" /> Saya sudah meninjau metode pajak, diskon,
        data pelanggan, dan jumlah tagihan.
      </label>
      <button disabled={!props.canGenerate || !ready} type="submit">
        Buat invoice PDF
      </button>
      {!props.canGenerate ? (
        <p className="transaction-flow-warning">
          Pembuatan PDF belum tersedia untuk transaksi ini atau template DocGen belum siap.
        </p>
      ) : null}
    </form>
  );
}
