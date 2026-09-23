import Link from "next/link";
import { redirect } from "next/navigation";
import { getOperationsOverview } from "@/features/operations/service";
import { getSession } from "@/lib/auth/session";

export const instant = false;

const masters = [
  { key: "customers", label: "Pelanggan", description: "Perusahaan dan kontak pembeli", count: "customers" },
  { key: "suppliers", label: "Pemasok", description: "Sumber bahan dan kebutuhan kerja", count: "suppliers" },
  { key: "materials", label: "Material", description: "Polimer, grade, dan spesifikasi", count: "materials" },
  { key: "products", label: "Barang", description: "Produk, spare part, dan satuan", count: "products" },
  { key: "moulds", label: "Mould", description: "Peralatan cetak dan cavity", count: "moulds" },
  { key: "designs", label: "File 3D", description: "Sumber kerja dan referensi privat", count: "designs" },
] as const;

export default async function MastersPage() {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const overview = await getOperationsOverview();
  return (
    <section className="operations-page master-hub">
      <header className="operations-head">
        <div>
          <p className="eyebrow">Data dasar operasional</p>
          <h1>Data rapi, mudah dicari saat pekerjaan bertambah.</h1>
          <p>
            Setiap jenis data memiliki ruang sendiri agar pencarian, penyaringan, dan riwayat tetap nyaman digunakan.
          </p>
        </div>
      </header>
      <nav className="master-hub__grid" aria-label="Pilih data master">
        {masters.map((master, index) => (
          <Link href={`/admin/masters/${master.key}`} key={master.key} className="master-hub__card">
            <span className="master-hub__number">0{index + 1}</span>
            <strong>{master.label}</strong>
            <small>{master.description}</small>
            <em>{overview?.counts[master.count] ?? 0} data</em>
          </Link>
        ))}
      </nav>
    </section>
  );
}
