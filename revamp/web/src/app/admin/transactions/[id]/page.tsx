import Link from "next/link";
import { notFound } from "next/navigation";
import { recordTransactionPayment, releaseProduction, verifyTransactionPayment } from "@/features/operations/actions";
import { requireOperationsAccess } from "@/features/operations/access";
import { getTransactionDetail } from "@/features/operations/service";

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function dateText(value: Date | null) {
  return value
    ? value.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "Belum ditetapkan";
}

function documentLabel(type: string) {
  const labels: Record<string, string> = {
    quotation: "Surat penawaran",
    purchase_order: "PO customer",
    contract: "Kontrak",
    invoice_dp: "Invoice DP",
    invoice_final: "Invoice pelunasan",
    tax_invoice: "Faktur pajak",
    delivery_note: "Surat jalan",
    bast: "Serah terima barang",
    payment_proof: "Bukti pembayaran",
  };
  return labels[type] ?? type;
}

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOperationsAccess();
  const { id } = await params;
  const transaction = await getTransactionDetail(id);
  if (!transaction) notFound();
  const { header, totals } = transaction;
  const eligibleForProduction = totals.receivedAmount > 0;

  return (
    <section className="transaction-detail-page">
      <header className="transaction-detail-head">
        <Link href="/admin/transactions">← Semua transaksi</Link>
        <div>
          <p className="eyebrow">{header.referenceNo}</p>
          <h1>{header.title}</h1>
          <p>
            {header.customerName} · Penanggung jawab: {header.ownerName ?? "Belum ditentukan"}
          </p>
        </div>
        <span className={`transaction-status transaction-status--${header.commercialStatus}`}>
          {header.commercialStatus.replaceAll("_", " ")}
        </span>
      </header>

      <div className="transaction-steps" aria-label="Tahap pekerjaan">
        <article className={header.commercialStatus === "quotation" ? "is-active" : "is-done"}>
          <span>1</span>
          <div>
            <strong>Komersial &amp; dokumen</strong>
            <small>Penawaran, PO, kontrak, invoice</small>
          </div>
        </article>
        <article className={header.paymentStatus === "verified" ? "is-done" : "is-active"}>
          <span>2</span>
          <div>
            <strong>Pembayaran</strong>
            <small>DP, pelunasan, piutang</small>
          </div>
        </article>
        <article className={header.fulfilmentStatus === "released" ? "is-active" : ""}>
          <span>3</span>
          <div>
            <strong>Produksi &amp; pengiriman</strong>
            <small>Mould, sampel, surat jalan, BAST</small>
          </div>
        </article>
      </div>

      <div className="transaction-detail-grid">
        <section className="transaction-panel transaction-panel--wide">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ringkasan pekerjaan</p>
              <h2>Nilai dan barang</h2>
            </div>
            <span className="transaction-due">Jatuh tempo: {dateText(header.dueAt)}</span>
          </div>
          {transaction.lines.length ? (
            <div className="line-table">
              <div className="line-table-head">
                <span>Barang / pekerjaan</span>
                <span>Jumlah</span>
                <span>Harga</span>
                <span>Nilai</span>
              </div>
              {transaction.lines.map((line) => (
                <div className="line-table-row" key={line.id}>
                  <span data-label="Barang / pekerjaan">
                    <strong>{line.productName ?? line.description}</strong>
                    <small>{line.materialName ?? "Material belum dipilih"}</small>
                  </span>
                  <span data-label="Jumlah">
                    {line.quantity} {line.unit}
                  </span>
                  <span data-label="Harga">{rupiah(Number(line.unitPrice))}</span>
                  <span data-label="Nilai">{rupiah(Number(line.quantity) * Number(line.unitPrice))}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-copy">Belum ada item. Tambahkan item saat menyiapkan penawaran.</p>
          )}
          <dl className="transaction-totals">
            <div>
              <dt>Nilai penawaran</dt>
              <dd>{rupiah(totals.quotedAmount)}</dd>
            </div>
            <div>
              <dt>Tagihan dibuat</dt>
              <dd>{rupiah(totals.invoiceAmount)}</dd>
            </div>
            <div>
              <dt>Pembayaran terverifikasi</dt>
              <dd>{rupiah(totals.receivedAmount)}</dd>
            </div>
            <div>
              <dt>Sisa piutang</dt>
              <dd>{rupiah(totals.outstandingAmount)}</dd>
            </div>
          </dl>
        </section>

        <aside className="transaction-panel">
          <p className="eyebrow">Tindakan berikutnya</p>
          <h2>{eligibleForProduction ? "Pembayaran sudah masuk." : "Menunggu pembayaran terverifikasi."}</h2>
          <p className="transaction-panel-copy">
            {eligibleForProduction
              ? "Administrator dapat melepas pekerjaan ke produksi setelah memeriksa bukti pembayaran."
              : "Sales dapat mencatat konfirmasi pembayaran. Administrator yang melakukan verifikasi."}
          </p>
          {user.role === "admin" && eligibleForProduction && header.fulfilmentStatus !== "released" ? (
            <form action={releaseProduction}>
              <input type="hidden" name="transactionId" value={header.id} />
              <button className="primary-action" type="submit">
                Lepaskan ke produksi
              </button>
            </form>
          ) : null}
          {header.fulfilmentStatus === "released" ? (
            <p className="released-note">Pekerjaan sudah dilepas ke produksi.</p>
          ) : null}
        </aside>
      </div>

      <div className="transaction-detail-grid">
        <section className="transaction-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Dokumen</p>
              <h2>Jejak komersial</h2>
            </div>
          </div>
          {transaction.documents.length ? (
            <div className="document-list">
              {transaction.documents.map((document) => (
                <article key={document.id}>
                  <span className="document-icon">PDF</span>
                  <div>
                    <strong>{documentLabel(document.type)}</strong>
                    <small>
                      {document.documentNo ?? document.originalName ?? "Belum bernomor"} · versi {document.version}
                    </small>
                  </div>
                  <em>{document.status}</em>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-copy">
              Belum ada dokumen. Surat penawaran, PO, kontrak, invoice, faktur pajak, surat jalan, dan BAST akan
              tersimpan privat di sini.
            </p>
          )}
        </section>

        <section className="transaction-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pembayaran</p>
              <h2>Catat konfirmasi</h2>
            </div>
          </div>
          <form action={recordTransactionPayment} className="payment-form">
            <input type="hidden" name="transactionId" value={header.id} />
            <label>
              Nominal
              <input name="amount" type="number" min="1" step="1" placeholder="Contoh: 2500000" required />
            </label>
            <label>
              Referensi / catatan
              <input name="reference" placeholder="Nomor transfer atau catatan" />
            </label>
            <button type="submit">Catat pembayaran</button>
          </form>
          <div className="financial-list">
            {transaction.entries.map((entry) => (
              <article key={entry.id}>
                <div>
                  <strong>{entry.direction === "in" ? "Pembayaran customer" : "Pengeluaran proyek"}</strong>
                  <small>
                    {dateText(entry.occurredAt)} · {entry.reference ?? "Tanpa referensi"}
                  </small>
                </div>
                <b>
                  {entry.direction === "in" ? "+" : "−"}
                  {rupiah(Number(entry.amount))}
                </b>
                {entry.status === "unverified" && user.role === "admin" ? (
                  <form action={verifyTransactionPayment}>
                    <input type="hidden" name="entryId" value={entry.id} />
                    <button type="submit">Verifikasi</button>
                  </form>
                ) : (
                  <em>{entry.status === "verified" ? "Terverifikasi" : "Menunggu cek"}</em>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="transaction-detail-grid">
        <section className="transaction-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Produksi</p>
              <h2>Mould, sampel, dan batch</h2>
            </div>
          </div>
          {transaction.batches.length ? (
            <div className="document-list">
              {transaction.batches.map((batch) => (
                <article key={batch.id}>
                  <span className="document-icon">{batch.kind === "sample" ? "SPL" : "PRD"}</span>
                  <div>
                    <strong>{batch.productName ?? batch.batchNo}</strong>
                    <small>
                      {batch.mouldName ?? "Mould belum dipilih"} · rencana {batch.plannedQuantity ?? 0} pcs
                    </small>
                  </div>
                  <em>{batch.status}</em>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-copy">
              Batch baru dapat dibuat setelah pekerjaan dilepas ke produksi. Sampel dan produksi penuh dicatat terpisah.
            </p>
          )}
        </section>
        <section className="transaction-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pengiriman &amp; BAST</p>
              <h2>Serah terima</h2>
            </div>
          </div>
          {transaction.shipments.length ? (
            <div className="document-list">
              {transaction.shipments.map((shipment) => (
                <article key={shipment.id}>
                  <span className="document-icon">KRM</span>
                  <div>
                    <strong>{shipment.shipmentNo}</strong>
                    <small>
                      {shipment.recipientName ?? header.customerName} · dikirim {dateText(shipment.shippedAt)}
                    </small>
                  </div>
                  <em>{shipment.status}</em>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-copy">
              Pengiriman parsial maupun penuh akan memiliki surat jalan sendiri. Transaksi selesai ketika BAST kembali
              ditandatangani customer.
            </p>
          )}
        </section>
      </div>

      <section className="transaction-activity">
        <p className="eyebrow">Aktivitas</p>
        <h2>Jejak keputusan</h2>
        {transaction.activity.length ? (
          transaction.activity.map((activity) => (
            <article key={activity.id}>
              <span />
              <div>
                <strong>{activity.actorName ?? "Sistem"}</strong>
                <p>{activity.action.replaceAll(".", " · ").replaceAll("_", " ")}</p>
              </div>
              <time>{dateText(activity.createdAt)}</time>
            </article>
          ))
        ) : (
          <p className="empty-copy">
            Perubahan penting pada status, pembayaran, dokumen, batch, dan pengiriman akan tercatat otomatis.
          </p>
        )}
      </section>
    </section>
  );
}
