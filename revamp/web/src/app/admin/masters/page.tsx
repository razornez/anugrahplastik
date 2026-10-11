import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { redirect } from "next/navigation";
import { getOperationsOverview } from "@/features/operations/service";
import { getSession } from "@/lib/auth/session";

export const instant = false;

const masters = [
  { key: "customers", label: "Pelanggan", description: "Perusahaan dan kontak pembeli", count: "customers", icon: "◇" },
  {
    key: "suppliers",
    label: "Pemasok",
    description: "Sumber bahan dan kebutuhan kerja",
    count: "suppliers",
    icon: "◫",
  },
  {
    key: "materials",
    label: "Material",
    description: "Polimer, grade, dan spesifikasi",
    count: "materials",
    icon: "◌",
  },
  { key: "products", label: "Barang", description: "Produk, spare part, dan satuan", count: "products", icon: "▣" },
  { key: "moulds", label: "Mould", description: "Peralatan cetak dan cavity", count: "moulds", icon: "◒" },
  { key: "designs", label: "File 3D", description: "Sumber kerja dan referensi privat", count: "designs", icon: "◈" },
] as const;

export default async function MastersPage() {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const overview = await getOperationsOverview();
  return (
    <section className="operations-page master-hub">
      <AdminPageHeader
        title="Data master"
        description="Kelola pelanggan, pemasok, material, produk, mould, dan file desain."
      />
      <nav className="master-hub__grid" aria-label="Pilih data master">
        {masters.map((master, index) => (
          <Link href={`/admin/masters/${master.key}`} key={master.key} className="master-hub__card">
            <span className="master-hub__watermark" aria-hidden="true">
              {master.icon}
            </span>
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
