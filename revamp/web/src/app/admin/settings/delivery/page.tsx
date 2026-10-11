import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import { initializeDeliveryCounter } from "@/features/operations/delivery-settings-actions";
import { getInvoiceIssuer, invoiceIssuerIsReady } from "@/features/operations/invoice-settings";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { deliveryNumberCounters } from "@/lib/database/schema";

export const instant = false;

export default async function DeliverySettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const database = getDatabase();
  const counters = database ? await database.select().from(deliveryNumberCounters) : [];
  const issuer = await getInvoiceIssuer();
  const year = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric" }).format(new Date()),
  );
  const current = counters.find((item) => item.referenceYear === year);
  const notice = await searchParams;
  return (
    <section className="admin-page invoice-settings-page">
      <AdminPageHeader
        title="Nomor surat jalan"
        description="Kelola urutan nomor SJ/AMB untuk pengiriman resmi."
        back={{ href: "/admin/transactions", label: "Kembali ke transaksi" }}
      />
      {notice.saved ? (
        <p className="integration-success" role="status">
          Nomor awal surat jalan tersimpan.
        </p>
      ) : null}
      <section className="transaction-flow-card">
        <h2>Identitas penerbit</h2>
        <p>
          {invoiceIssuerIsReady(issuer)
            ? "Identitas telah disetujui."
            : "Identitas penerbit belum siap untuk surat resmi."}
        </p>
        <Link href="/admin/settings/invoice">Periksa nama, kontak, dan logo</Link>
      </section>
      <section className="transaction-flow-card">
        <h2>Urutan nomor surat {year}</h2>
        {current ? (
          <p>
            Nomor terakhir tercatat: <strong>{current.lastValue}</strong>. Urutan tidak dapat direset dari halaman ini.
          </p>
        ) : (
          <>
            <p>
              Masukkan nomor urut terakhir yang sudah dipakai di luar aplikasi. Nomor pada contoh bukan otomatis nomor
              terakhir.
            </p>
            <form action={initializeDeliveryCounter} className="transaction-flow-form">
              <input name="year" type="hidden" value={year} />
              <label>
                Nomor urut terakhir <input min="0" name="lastValue" required step="1" type="number" />
              </label>
              <button type="submit">Tetapkan nomor awal</button>
            </form>
          </>
        )}
        <p>Surat jalan uji memakai nomor UJI dan tidak memakai urutan resmi.</p>
      </section>
    </section>
  );
}
