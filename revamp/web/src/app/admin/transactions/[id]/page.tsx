import Link from "next/link";
import { notFound } from "next/navigation";
import {
  recordTransactionPayment,
  releaseProduction,
  updateTransactionTrackStatus,
  verifyTransactionPayment,
} from "@/features/operations/actions";
import { requireOperationsAccess } from "@/features/operations/access";
import { getTransactionDetail } from "@/features/operations/service";

export const instant = false;

type TransactionStage = "commercial" | "payment" | "fulfilment";

const stages: Record<TransactionStage, { label: string; shortLabel: string; description: string }> = {
  commercial: {
    label: "Penawaran",
    shortLabel: "Penawaran",
    description: "Kebutuhan, nilai, dan dokumen komersial.",
  },
  payment: {
    label: "Pembayaran",
    shortLabel: "Pembayaran",
    description: "Tagihan, konfirmasi, dan saldo customer.",
  },
  fulfilment: {
    label: "Produksi & pengiriman",
    shortLabel: "Produksi",
    description: "Mould, sampel, pengiriman, dan serah terima.",
  },
};

const stageStatusOptions: Record<TransactionStage, Array<{ value: string; label: string }>> = {
  commercial: [
    { value: "quotation", label: "Menyiapkan penawaran" },
    { value: "po_received", label: "PO diterima" },
    { value: "contract", label: "Kontrak / invoice" },
    { value: "completed", label: "Komersial selesai" },
  ],
  payment: [
    { value: "awaiting_invoice", label: "Belum ada tagihan" },
    { value: "payment_recorded", label: "Menunggu verifikasi" },
    { value: "verified", label: "Terverifikasi" },
  ],
  fulfilment: [
    { value: "not_released", label: "Belum dilepas" },
    { value: "released", label: "Sudah dilepas ke produksi" },
    { value: "completed", label: "Produksi & pengiriman selesai" },
  ],
};

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

function statusLabel(stage: TransactionStage, value: string) {
  return stageStatusOptions[stage].find((option) => option.value === value)?.label ?? value.replaceAll("_", " ");
}

function getSuggestedStage(status: { paymentStatus: string; fulfilmentStatus: string }): TransactionStage {
  if (["released", "completed"].includes(status.fulfilmentStatus)) return "fulfilment";
  if (["payment_recorded", "verified"].includes(status.paymentStatus)) return "payment";
  return "commercial";
}

function stageStatus(
  stage: TransactionStage,
  header: { commercialStatus: string; paymentStatus: string; fulfilmentStatus: string },
) {
  if (stage === "commercial") return header.commercialStatus;
  if (stage === "payment") return header.paymentStatus;
  return header.fulfilmentStatus;
}

function activityLabel(action: string, metadata: unknown) {
  if (
    action === "transaction.track_status_changed" &&
    metadata &&
    typeof metadata === "object" &&
    "reason" in metadata
  ) {
    const reason = typeof metadata.reason === "string" ? metadata.reason : "";
    return reason ? `Tahap diperbarui · ${reason}` : "Tahap diperbarui";
  }
  const labels: Record<string, string> = {
    "transaction.created": "Transaksi dibuat",
    "transaction.payment_recorded": "Pembayaran dicatat",
    "transaction.payment_verified": "Pembayaran diverifikasi",
    "transaction.production_released": "Pekerjaan dilepas ke produksi",
  };
  return labels[action] ?? action.replaceAll(".", " · ").replaceAll("_", " ");
}

function StageNavigation({
  id,
  activeStage,
  header,
}: {
  id: string;
  activeStage: TransactionStage;
  header: { commercialStatus: string; paymentStatus: string; fulfilmentStatus: string };
}) {
  return (
    <nav aria-label="Tahap transaksi" className="transaction-stage-nav">
      {(Object.keys(stages) as TransactionStage[]).map((stage, index) => {
        const isActive = activeStage === stage;
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={isActive ? "is-active" : undefined}
            href={`/admin/transactions/${id}?stage=${stage}`}
            key={stage}
          >
            <span className="transaction-stage-nav__number">0{index + 1}</span>
            <span>
              <strong>{stages[stage].shortLabel}</strong>
              <small>{statusLabel(stage, stageStatus(stage, header))}</small>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function StageManager({ id, stage, currentStatus }: { id: string; stage: TransactionStage; currentStatus: string }) {
  return (
    <details className="transaction-stage-manager">
      <summary>Kelola tahap</summary>
      <form action={updateTransactionTrackStatus}>
        <input name="transactionId" type="hidden" value={id} />
        <input name="track" type="hidden" value={stage} />
        <label>
          Status {stages[stage].label.toLowerCase()}
          <select defaultValue={currentStatus} name="status">
            {stageStatusOptions[stage].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Alasan perubahan
          <input maxLength={240} minLength={3} name="reason" placeholder="Contoh: PO diterima melalui email" required />
        </label>
        <button type="submit">Simpan status</button>
      </form>
    </details>
  );
}

export default async function TransactionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const user = await requireOperationsAccess();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const transaction = await getTransactionDetail(id);
  if (!transaction) notFound();

  const { header, totals } = transaction;
  const suggestedStage = getSuggestedStage(header);
  const activeStage =
    query.stage === "commercial" || query.stage === "payment" || query.stage === "fulfilment"
      ? query.stage
      : suggestedStage;
  const activeStatus = stageStatus(activeStage, header);
  const commercialDocuments = transaction.documents.filter((document) =>
    ["quotation", "purchase_order", "contract", "invoice_dp", "invoice_final", "tax_invoice"].includes(document.type),
  );
  const deliveryDocuments = transaction.documents.filter((document) =>
    ["delivery_note", "bast"].includes(document.type),
  );
  const eligibleForProduction = totals.receivedAmount > 0;

  return (
    <section className="transaction-workspace-page">
      <header className="transaction-workspace-head">
        <Link href="/admin/transactions">← Semua transaksi</Link>
        <div className="transaction-workspace-head__body">
          <div>
            <p className="eyebrow">{header.referenceNo}</p>
            <h1>{header.title}</h1>
            <p>{header.customerName}</p>
          </div>
          <span className="transaction-status">Tahap utama: {stages[suggestedStage].label}</span>
        </div>
      </header>

      <div className="transaction-workspace-layout">
        <main>
          <StageNavigation activeStage={activeStage} header={header} id={header.id} />

          <section className="transaction-stage-focus">
            <div className="transaction-stage-focus__intro">
              <span aria-hidden="true">0{Object.keys(stages).indexOf(activeStage) + 1}</span>
              <div>
                <p className="eyebrow">Tahap aktif</p>
                <h2>{stages[activeStage].label}</h2>
                <p>{stages[activeStage].description}</p>
              </div>
              {user.role === "admin" ? (
                <StageManager currentStatus={activeStatus} id={header.id} stage={activeStage} />
              ) : null}
            </div>

            {activeStage === "commercial" ? (
              <>
                <section className="transaction-next-action">
                  <span className="transaction-next-action__icon">01</span>
                  <div>
                    <p className="eyebrow">Status penawaran</p>
                    <h3>{statusLabel("commercial", header.commercialStatus)}</h3>
                    <p>Siapkan ruang lingkup, nilai, dan dokumen komersial sebelum pekerjaan diteruskan.</p>
                  </div>
                </section>
                <div className="transaction-stage-grid">
                  <section className="transaction-workspace-card transaction-workspace-card--primary">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">Nilai &amp; barang</p>
                        <h2>{transaction.lines.length ? "Rincian pekerjaan" : "Nilai belum disiapkan"}</h2>
                      </div>
                      <span className="transaction-due">Target: {dateText(header.dueAt)}</span>
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
                      <p className="workspace-empty">
                        Rincian barang dan anggaran akan muncul di sini saat penawaran disiapkan.
                      </p>
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
                    </dl>
                  </section>
                  <section className="transaction-workspace-card">
                    <p className="eyebrow">Dokumen komersial</p>
                    <h2>Penawaran hingga invoice</h2>
                    {commercialDocuments.length ? (
                      <div className="document-list">
                        {commercialDocuments.map((document) => (
                          <article key={document.id}>
                            <span className="document-icon">PDF</span>
                            <div>
                              <strong>{documentLabel(document.type)}</strong>
                              <small>{document.documentNo ?? document.originalName ?? "Belum bernomor"}</small>
                            </div>
                            <em>{document.status}</em>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="workspace-empty">Belum ada dokumen komersial untuk pekerjaan ini.</p>
                    )}
                  </section>
                </div>
              </>
            ) : null}

            {activeStage === "payment" ? (
              <>
                <section className="transaction-next-action">
                  <span className="transaction-next-action__icon">02</span>
                  <div>
                    <p className="eyebrow">Status pembayaran</p>
                    <h3>{statusLabel("payment", header.paymentStatus)}</h3>
                    <p>
                      Catat pembayaran dari customer di sini. Verifikasi dilakukan administrator sebelum produksi
                      dilepas.
                    </p>
                  </div>
                </section>
                <dl className="transaction-metric-strip">
                  <div>
                    <dt>Tagihan dibuat</dt>
                    <dd>{rupiah(totals.invoiceAmount)}</dd>
                  </div>
                  <div>
                    <dt>Diterima</dt>
                    <dd>{rupiah(totals.receivedAmount)}</dd>
                  </div>
                  <div>
                    <dt>Sisa piutang</dt>
                    <dd>{rupiah(totals.outstandingAmount)}</dd>
                  </div>
                </dl>
                <div className="transaction-stage-grid">
                  <section className="transaction-workspace-card transaction-workspace-card--primary">
                    <p className="eyebrow">Konfirmasi pembayaran</p>
                    <h2>Catat pembayaran masuk</h2>
                    <form action={recordTransactionPayment} className="payment-form">
                      <input name="transactionId" type="hidden" value={header.id} />
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
                  </section>
                  <section className="transaction-workspace-card">
                    <p className="eyebrow">Riwayat pembayaran</p>
                    <h2>Catatan dana pekerjaan</h2>
                    {transaction.entries.length ? (
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
                                <input name="entryId" type="hidden" value={entry.id} />
                                <button type="submit">Verifikasi</button>
                              </form>
                            ) : (
                              <em>{entry.status === "verified" ? "Terverifikasi" : "Menunggu cek"}</em>
                            )}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="workspace-empty">Belum ada pembayaran yang dicatat pada pekerjaan ini.</p>
                    )}
                  </section>
                </div>
              </>
            ) : null}

            {activeStage === "fulfilment" ? (
              <>
                <section className="transaction-next-action">
                  <span className="transaction-next-action__icon">03</span>
                  <div>
                    <p className="eyebrow">Status produksi &amp; pengiriman</p>
                    <h3>{statusLabel("fulfilment", header.fulfilmentStatus)}</h3>
                    <p>
                      {eligibleForProduction
                        ? "Pembayaran terverifikasi tersedia. Periksa status lalu lepaskan pekerjaan saat siap."
                        : "Produksi dapat dimulai setelah pembayaran customer terverifikasi."}
                    </p>
                  </div>
                  {user.role === "admin" && eligibleForProduction && header.fulfilmentStatus !== "released" ? (
                    <form action={releaseProduction}>
                      <input name="transactionId" type="hidden" value={header.id} />
                      <button className="primary-action" type="submit">
                        Lepaskan ke produksi
                      </button>
                    </form>
                  ) : null}
                </section>
                <div className="transaction-stage-grid">
                  <section className="transaction-workspace-card">
                    <p className="eyebrow">Produksi</p>
                    <h2>Mould, sampel, dan batch</h2>
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
                      <p className="workspace-empty">Belum ada sampel atau batch produksi untuk pekerjaan ini.</p>
                    )}
                  </section>
                  <section className="transaction-workspace-card">
                    <p className="eyebrow">Pengiriman &amp; serah terima</p>
                    <h2>Barang sampai ke customer</h2>
                    {transaction.shipments.length || deliveryDocuments.length ? (
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
                        {deliveryDocuments.map((document) => (
                          <article key={document.id}>
                            <span className="document-icon">PDF</span>
                            <div>
                              <strong>{documentLabel(document.type)}</strong>
                              <small>{document.documentNo ?? document.originalName ?? "Belum bernomor"}</small>
                            </div>
                            <em>{document.status}</em>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="workspace-empty">Belum ada surat jalan, BAST, atau pengiriman yang dicatat.</p>
                    )}
                  </section>
                </div>
              </>
            ) : null}
          </section>
        </main>

        <aside className="transaction-context-panel">
          <p className="eyebrow">Informasi pekerjaan</p>
          <h2>Ringkasan yang selalu terlihat.</h2>
          <dl>
            <div>
              <dt>Customer</dt>
              <dd>{header.customerName}</dd>
            </div>
            <div>
              <dt>Penanggung jawab</dt>
              <dd>{header.ownerName ?? "Belum ditentukan"}</dd>
            </div>
            <div>
              <dt>Target pekerjaan</dt>
              <dd>{dateText(header.dueAt)}</dd>
            </div>
          </dl>
          <div className="transaction-context-panel__amount">
            <span>Nilai penawaran</span>
            <strong>{rupiah(totals.quotedAmount)}</strong>
            <small>
              {totals.outstandingAmount ? `Sisa piutang ${rupiah(totals.outstandingAmount)}` : "Belum ada piutang"}
            </small>
          </div>
          <details className="transaction-activity-details">
            <summary>
              Riwayat keputusan <span>{transaction.activity.length}</span>
            </summary>
            {transaction.activity.length ? (
              <div>
                {transaction.activity.map((activity) => (
                  <article key={activity.id}>
                    <span />
                    <p>
                      <strong>{activity.actorName ?? "Sistem"}</strong>
                      {activityLabel(activity.action, activity.metadata)}
                    </p>
                    <time>{dateText(activity.createdAt)}</time>
                  </article>
                ))}
              </div>
            ) : (
              <p className="workspace-empty">Perubahan penting akan tercatat di sini.</p>
            )}
          </details>
        </aside>
      </div>
    </section>
  );
}
