import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import {
  approveInvoiceIssuer,
  initializeInvoiceCounter,
  saveInvoiceIssuer,
} from "@/features/operations/invoice-settings-actions";
import { getInvoiceIssuer, invoiceIssuerIsReady } from "@/features/operations/invoice-settings";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { invoiceNumberCounters } from "@/lib/database/schema";

export const instant = false;

const fields = [
  ["legalName", "Nama badan usaha"],
  ["address", "Alamat penerbit"],
  ["phone", "Telepon"],
  ["email", "Email"],
  ["website", "Situs web"],
  ["taxId", "NPWP (jika dicantumkan)"],
  ["bankName", "Bank"],
  ["bankAccountNo", "Nomor rekening"],
  ["bankAccountName", "Nama pemilik rekening"],
  ["signerName", "Nama penanda tangan"],
  ["signerTitle", "Jabatan penanda tangan"],
  ["logoPath", "Path logo yang disetujui (misalnya /invoice/logo.webp)"],
] as const;

export default async function InvoiceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; approved?: string; counter?: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const issuer = await getInvoiceIssuer();
  const database = getDatabase();
  const counters = database ? await database.select().from(invoiceNumberCounters) : [];
  const year = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric" }).format(new Date()),
  );
  const current = counters.find((item) => item.referenceYear === year);
  const notice = await searchParams;
  return (
    <section className="admin-page invoice-settings-page">
      <AdminPageHeader
        title="Identitas dan nomor invoice"
        description="Isi data resmi penerbit dan kelola nomor invoice."
        back={{ href: "/admin/transactions", label: "Kembali ke transaksi" }}
      />
      {notice.saved || notice.approved || notice.counter ? (
        <p role="status" className="integration-success">
          Perubahan tersimpan. Periksa lagi sebelum menerbitkan invoice resmi.
        </p>
      ) : null}
      <div className="invoice-settings-grid">
        <section className="transaction-flow-card">
          <h2>Identitas penerbit</h2>
          <p>
            Status: {invoiceIssuerIsReady(issuer) ? "Disetujui" : "Belum siap untuk penerbitan resmi"}. Mengubah data
            akan membatalkan persetujuan sebelumnya.
          </p>
          <form action={saveInvoiceIssuer} className="transaction-flow-form">
            {fields.map(([name, label]) => (
              <label key={name}>
                {label}
                <input
                  defaultValue={issuer?.[name] ?? ""}
                  maxLength={name === "address" ? 1000 : 255}
                  name={name}
                  required={!["website", "taxId"].includes(name)}
                  type={name === "email" ? "email" : "text"}
                />
              </label>
            ))}
            <button type="submit">Simpan identitas</button>
          </form>
          {issuer && !issuer.approvedAt ? (
            <form action={approveInvoiceIssuer} className="transaction-flow-form">
              <label>
                <input name="reviewed" required type="checkbox" value="yes" /> Saya sudah mencocokkan nama, rekening,
                logo, dan penanda tangan dengan dokumen resmi.
              </label>
              <button type="submit">Setujui identitas penerbit</button>
            </form>
          ) : null}
        </section>
        <section className="transaction-flow-card">
          <h2>Urutan nomor invoice {year}</h2>
          {current ? (
            <p>
              Nomor terakhir tercatat: <strong>{current.lastValue}</strong>. Counter tidak dapat direset melalui halaman
              ini.
            </p>
          ) : (
            <>
              <p>
                Masukkan nomor urut terakhir yang sudah digunakan di luar aplikasi. Contoh PDF bernomor 041 belum tentu
                nomor terakhir.
              </p>
              <form action={initializeInvoiceCounter} className="transaction-flow-form">
                <input name="year" type="hidden" value={year} />
                <label>
                  Nomor urut terakhir
                  <input min="0" name="lastValue" required step="1" type="number" />
                </label>
                <button type="submit">Tetapkan nomor awal</button>
              </form>
            </>
          )}
          <p>
            Nomor baru memakai format INV/AMB/NNN/BULAN-ROMAWI/TAHUN. Transaksi uji memakai nomor UJI dan tidak
            mengambil urutan resmi.
          </p>
        </section>
      </div>
    </section>
  );
}
