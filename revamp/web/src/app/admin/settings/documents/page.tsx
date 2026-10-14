import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import {
  getDocumentTemplateState,
  documentTemplateKinds,
  documentTemplateLabels,
} from "@/features/operations/document-templates";
import { initializeDocumentCounter, saveAndActivateIssuer } from "@/features/operations/document-settings-actions";
import { getInvoiceIssuer, invoiceIssuerIsReady } from "@/features/operations/invoice-settings";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import {
  deliveryNumberCounters,
  handoverNumberCounters,
  invoiceNumberCounters,
  quotationNumberCounters,
} from "@/lib/database/schema";

export const instant = false;

const fields = [
  ["legalName", "Nama badan usaha"],
  ["address", "Alamat penerbit"],
  ["phone", "Telepon"],
  ["email", "Email"],
  ["website", "Situs web"],
  ["taxId", "NPWP (opsional)"],
  ["bankName", "Bank"],
  ["bankAccountNo", "Nomor rekening"],
  ["bankAccountName", "Nama pemilik rekening"],
  ["signerName", "Nama penanda tangan"],
  ["signerTitle", "Jabatan penanda tangan"],
] as const;

const logos = [
  ["/brand/quotation-logo.png", "Logo dokumen resmi"],
  ["/brand/anugrah-plastik-social-logo-v1.png", "Logo lengkap"],
  ["/brand/anugrah-plastik-mark.png", "Simbol ringkas"],
] as const;

const counterLabels = {
  quotation: "SP",
  invoice: "Invoice",
  delivery: "SJ",
  handover: "STB",
} as const;

export default async function DocumentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; status?: string; error?: string; field?: string; kind?: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const database = getDatabase();
  const year = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric" }).format(new Date()),
  );
  const [issuer, quoteRows, invoiceRows, deliveryRows, handoverRows, ...templateStates] = await Promise.all([
    getInvoiceIssuer(),
    database?.select().from(quotationNumberCounters) ?? [],
    database?.select().from(invoiceNumberCounters) ?? [],
    database?.select().from(deliveryNumberCounters) ?? [],
    database?.select().from(handoverNumberCounters) ?? [],
    ...documentTemplateKinds.map((kind) => getDocumentTemplateState(kind)),
  ]);
  const query = await searchParams;
  const counters = {
    quotation: quoteRows.find((row) => row.referenceYear === year),
    invoice: invoiceRows.find((row) => row.referenceYear === year),
    delivery: deliveryRows.find((row) => row.referenceYear === year),
    handover: handoverRows.find((row) => row.referenceYear === year),
  };
  const identityReady = invoiceIssuerIsReady(issuer);
  const unfinished =
    (identityReady ? 0 : 1) +
    documentTemplateKinds.filter((kind) => !counters[kind]).length +
    templateStates.filter((state) => !state.active).length;
  const error =
    query.error === "identity-validation"
      ? "Periksa kembali data identitas yang ditandai."
      : query.error === "logo"
        ? "Logo tidak dapat dibaca. Pilih salah satu logo resmi."
        : query.error === "counter-validation"
          ? "Nomor terakhir harus berupa angka 0 sampai 999999."
          : query.error === "counter-exists"
            ? "Nomor tahun ini sudah diatur dan tidak dapat direset dari halaman ini."
            : query.error
              ? "Perubahan belum dapat disimpan. Coba lagi."
              : null;
  return (
    <section className="admin-page document-settings-page">
      <AdminPageHeader
        title="Dokumen resmi"
        description="Kelola identitas, nomor urut, dan kesiapan dokumen dari satu tempat."
        back={{ href: "/admin/transactions", label: "Kembali ke transaksi" }}
      />
      <div className="document-readiness-summary" data-ready={unfinished === 0 ? "true" : undefined} role="status">
        <strong>{unfinished === 0 ? "Siap menerbitkan dokumen" : `${unfinished} pengaturan belum selesai`}</strong>
        <span>
          {unfinished === 0
            ? "Identitas, nomor, dan empat template sudah aktif."
            : "Selesaikan item yang berstatus belum siap di bawah."}
        </span>
      </div>
      {query.status ? (
        <p className="integration-success">Perubahan tersimpan dan status dokumen sudah diperbarui.</p>
      ) : null}
      {error ? <p className="integration-error">{error}</p> : null}

      <section className="document-settings-section" id="identity">
        <header>
          <div>
            <span>01</span>
            <h2>Identitas penerbit</h2>
          </div>
          <strong className={identityReady ? "is-ready" : "is-pending"}>
            {identityReady ? "Aktif" : "Belum siap"}
          </strong>
        </header>
        <p>Dipakai bersama pada Penawaran, Invoice, Surat Jalan, dan STB.</p>
        <form action={saveAndActivateIssuer} className="document-identity-form">
          <div className="document-form-grid">
            {fields.map(([name, label]) => (
              <label className={name === "address" ? "is-wide" : undefined} key={name}>
                {label}
                {name === "address" ? (
                  <textarea
                    defaultValue={issuer?.address ?? ""}
                    maxLength={1000}
                    minLength={8}
                    name={name}
                    required
                    rows={2}
                  />
                ) : (
                  <input
                    defaultValue={issuer?.[name] ?? ""}
                    maxLength={255}
                    name={name}
                    required={!(["website", "taxId"] as string[]).includes(name)}
                    type={name === "email" ? "email" : "text"}
                  />
                )}
              </label>
            ))}
          </div>
          <fieldset className="document-logo-picker">
            <legend>Logo dokumen</legend>
            <div>
              {logos.map(([path, label]) => (
                <label key={path}>
                  <input
                    defaultChecked={(issuer?.logoPath || logos[0][0]) === path}
                    name="logoPath"
                    required
                    type="radio"
                    value={path}
                  />
                  <Image alt="" height={44} src={path} width={76} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit">Simpan dan aktifkan</button>
        </form>
      </section>

      <section className="document-settings-section" id="numbers">
        <header>
          <div>
            <span>02</span>
            <h2>Nomor urut {year}</h2>
          </div>
        </header>
        <p>Setiap jenis dokumen memiliki urutannya sendiri. Nomor resmi baru diambil saat PDF pertama diterbitkan.</p>
        <div className="document-counter-list">
          {documentTemplateKinds.map((kind) => {
            const current = counters[kind];
            return (
              <div className="document-counter-row" key={kind}>
                <div>
                  <strong>{counterLabels[kind]}</strong>
                  <span>{documentTemplateLabels[kind]}</span>
                </div>
                {current ? (
                  <div className="document-counter-values">
                    <span>
                      Terakhir <strong>{current.lastValue}</strong>
                    </span>
                    <span>
                      Berikutnya <strong>{current.lastValue + 1}</strong>
                    </span>
                  </div>
                ) : (
                  <form action={initializeDocumentCounter}>
                    <input name="kind" type="hidden" value={kind} />
                    <input name="year" type="hidden" value={year} />
                    <label>
                      Nomor terakhir
                      <input
                        aria-label={`Nomor terakhir ${documentTemplateLabels[kind]}`}
                        min="0"
                        name="lastValue"
                        required
                        step="1"
                        type="number"
                      />
                    </label>
                    <button type="submit">Atur</button>
                  </form>
                )}
                <span className={current ? "is-ready" : "is-pending"}>{current ? "Siap" : "Belum diatur"}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="document-settings-section" id="templates">
        <header>
          <div>
            <span>03</span>
            <h2>Template Dokumen PDF</h2>
          </div>
          <Link href="/admin/settings/templates?area=pdf">Kelola template</Link>
        </header>
        <p>Struktur tabel, formula, nomor, dan variabel sistem dikunci agar PDF tetap aman.</p>
        <div className="document-template-readiness-list">
          {templateStates.map((state) => (
            <Link href={`/admin/settings/templates?area=pdf&kind=${state.kind}`} key={state.kind}>
              <span>
                <strong>{documentTemplateLabels[state.kind]}</strong>
                <small>
                  {state.active ? `Versi ${state.active.version} · smoke render lolos` : "Belum memiliki versi aktif"}
                </small>
              </span>
              <span className={state.active ? "is-ready" : "is-pending"}>{state.active ? "Aktif" : "Belum siap"}</span>
            </Link>
          ))}
        </div>
        <details className="document-technical-details">
          <summary>Rincian teknis untuk Admin</summary>
          <p>
            Localhost memakai renderer QA. Production memakai ID provider milik setiap versi aktif dan mempertahankan
            versi lama untuk arsip.
          </p>
        </details>
      </section>
    </section>
  );
}
