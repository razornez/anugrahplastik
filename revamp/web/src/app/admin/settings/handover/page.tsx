import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import { initializeHandoverCounter } from "@/features/operations/handover-settings-actions";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { handoverNumberCounters } from "@/lib/database/schema";

export const instant = false;

export default async function HandoverSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const database = getDatabase();
  const counters = database ? await database.select().from(handoverNumberCounters) : [];
  const year = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric" }).format(new Date()),
  );
  const current = counters.find((item) => item.referenceYear === year);
  const query = await searchParams;
  return (
    <section className="admin-page invoice-settings-page">
      <AdminPageHeader
        title="Nomor surat serah terima"
        description="Kelola urutan nomor STB/AMB untuk barang yang diterima pelanggan."
        back={{ href: "/admin/transactions", label: "Kembali ke transaksi" }}
      />
      {query.saved ? (
        <p className="integration-success" role="status">
          Nomor awal STB tersimpan.
        </p>
      ) : null}
      <section className="transaction-flow-card">
        <h2>Urutan nomor {year}</h2>
        {current ? (
          <p>
            Nomor terakhir tercatat: <strong>{current.lastValue}</strong>. Urutan tidak dapat direset dari sini.
          </p>
        ) : (
          <>
            <p>
              Masukkan nomor urut terakhir yang sudah dipakai di luar aplikasi. Jangan menganggap nomor pada contoh
              sebagai nomor terakhir.
            </p>
            <form action={initializeHandoverCounter} className="transaction-flow-form">
              <input name="year" type="hidden" value={year} />
              <label>
                Nomor urut terakhir <input min="0" name="lastValue" required step="1" type="number" />
              </label>
              <button type="submit">Tetapkan nomor awal</button>
            </form>
          </>
        )}
        <p>STB contoh untuk transaksi uji memakai awalan UJI dan tidak menghabiskan urutan resmi.</p>
      </section>
    </section>
  );
}
