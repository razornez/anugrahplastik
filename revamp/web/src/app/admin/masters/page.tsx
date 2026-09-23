import { redirect } from "next/navigation";
import {
  createCustomer,
  createMaterial,
  createMould,
  createProduct,
  createSupplier,
} from "@/features/operations/actions";
import { getMasterDirectory } from "@/features/operations/service";
import { getSession } from "@/lib/auth/session";
import { DesignUploadForm } from "@/components/design-upload-form";
import Link from "next/link";

function formatBytes(value: number) {
  return value < 1_000_000 ? `${Math.max(1, Math.round(value / 1_000))} KB` : `${(value / 1_000_000).toFixed(1)} MB`;
}

export default async function MastersPage() {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const directory = await getMasterDirectory();
  const designTargets = [
    ...(directory
      ? directory.productRows.map((item) => ({ id: item.id, type: "product" as const, label: `Barang · ${item.name}` }))
      : []),
    ...(directory
      ? directory.mouldRows.map((item) => ({ id: item.id, type: "mould" as const, label: `Mould · ${item.name}` }))
      : []),
    ...(directory
      ? directory.customerRows.map((item) => ({
          id: item.id,
          type: "customer" as const,
          label: `Customer · ${item.displayName}`,
        }))
      : []),
  ];

  return (
    <section className="operations-page">
      <header className="operations-head">
        <div>
          <p className="eyebrow">Data dasar operasional</p>
          <h1>Satu sumber data untuk setiap pekerjaan.</h1>
          <p>
            Riwayat pembelian, produksi, dan penggunaan bahan akan dihitung dari transaksi; data ini hanya menyimpan
            identitas dan spesifikasi dasarnya.
          </p>
        </div>
      </header>

      <div className="master-summary">
        <article>
          <span>Pelanggan</span>
          <strong>{directory?.customerRows.length ?? 0}</strong>
        </article>
        <article>
          <span>Pemasok</span>
          <strong>{directory?.supplierRows.length ?? 0}</strong>
        </article>
        <article>
          <span>Bahan</span>
          <strong>{directory?.materialRows.length ?? 0}</strong>
        </article>
        <article>
          <span>Barang &amp; mould</span>
          <strong>{(directory?.productRows.length ?? 0) + (directory?.mouldRows.length ?? 0)}</strong>
        </article>
      </div>

      <div className="master-sections">
        <section className="master-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pelanggan</p>
              <h2>Daftar customer</h2>
            </div>
          </div>
          <form className="compact-form" action={createCustomer}>
            <input name="code" placeholder="Kode, mis. CUS-001" required />
            <input name="name" placeholder="Nama perusahaan / customer" required />
            <input name="email" type="email" placeholder="Email (opsional)" />
            <input name="phone" inputMode="tel" placeholder="WhatsApp (opsional)" />
            <button type="submit">Tambah customer</button>
          </form>
          <div className="master-list">
            {directory?.customerRows.map((item) => (
              <article key={item.id}>
                <span className="master-code">{item.code}</span>
                <div>
                  <strong>{item.displayName}</strong>
                  <small>{item.phone ?? item.email ?? "Kontak belum diisi"}</small>
                </div>
                <em>{item.status === "active" ? "Aktif" : "Nonaktif"}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="master-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pemasok</p>
              <h2>Sumber bahan</h2>
            </div>
          </div>
          <form className="compact-form compact-form--two" action={createSupplier}>
            <input name="code" placeholder="Kode pemasok" required />
            <input name="name" placeholder="Nama pemasok" required />
            <button type="submit">Tambah pemasok</button>
          </form>
          <div className="master-list">
            {directory?.supplierRows.map((item) => (
              <article key={item.id}>
                <span className="master-code">{item.code}</span>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.contactName ?? item.phone ?? "Kontak belum diisi"}</small>
                </div>
                <em>{item.status === "active" ? "Aktif" : "Nonaktif"}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="master-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Bahan</p>
              <h2>Material dan grade</h2>
            </div>
          </div>
          <form className="compact-form compact-form--two" action={createMaterial}>
            <input name="code" placeholder="Kode bahan" required />
            <input name="name" placeholder="Nama bahan" required />
            <input name="family" placeholder="Keluarga polimer, mis. PP" required />
            <input name="grade" placeholder="Grade (opsional)" />
            <button type="submit">Tambah bahan</button>
          </form>
          <div className="master-list">
            {directory?.materialRows.map((item) => (
              <article key={item.id}>
                <span className="master-code">{item.code}</span>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.polymerFamily}
                    {item.grade ? ` · ${item.grade}` : ""}
                  </small>
                </div>
                <em>{item.status === "active" ? "Aktif" : "Nonaktif"}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="master-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Barang</p>
              <h2>Produk dan spare part</h2>
            </div>
          </div>
          <form className="compact-form compact-form--two" action={createProduct}>
            <input name="sku" placeholder="Kode barang" required />
            <input name="name" placeholder="Nama barang" required />
            <input name="weight" type="number" min="0" step="0.001" placeholder="Berat per pcs (gram)" />
            <button type="submit">Tambah barang</button>
          </form>
          <div className="master-list">
            {directory?.productRows.map((item) => (
              <article key={item.id}>
                <span className="master-code">{item.sku}</span>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.unitWeightGrams
                      ? `${item.unitWeightGrams} gram / ${item.unit}`
                      : `Belum ada berat · ${item.unit}`}
                  </small>
                </div>
                <em>{item.status === "active" ? "Aktif" : "Nonaktif"}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="master-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Mould</p>
              <h2>Peralatan cetak</h2>
            </div>
          </div>
          <form className="compact-form compact-form--two" action={createMould}>
            <input name="code" placeholder="Kode mould" required />
            <input name="name" placeholder="Nama mould" required />
            <input name="cavities" type="number" min="1" placeholder="Jumlah cavity" />
            <button type="submit">Tambah mould</button>
          </form>
          <div className="master-list">
            {directory?.mouldRows.map((item) => (
              <article key={item.id}>
                <span className="master-code">{item.code}</span>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.cavityCount ? `${item.cavityCount} cavity` : "Cavity belum diisi"}</small>
                </div>
                <em>{item.status}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="master-card master-card--design">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Desain 3D privat</p>
              <h2>File kerja dan referensi</h2>
            </div>
          </div>
          <p className="master-note">
            Menerima STEP, IGES, STL, OBJ, GLB, DWG/DXF, dan NX/PRT. Hanya STL, OBJ, dan GLB yang dapat dipreview di
            browser; file CAD lain tetap aman untuk diunduh tim berwenang.
          </p>
          <DesignUploadForm options={designTargets} />
          <div className="master-list">
            {directory?.designRows.length ? (
              directory.designRows.map((item) => (
                <article key={item.id}>
                  <span className="master-code">{item.format.toUpperCase()}</span>
                  <div>
                    <strong>{item.originalName}</strong>
                    <small>
                      {item.productName ?? item.customerName ?? "Belum ditautkan"} · {formatBytes(item.byteSize)}
                    </small>
                  </div>
                  <Link href={`/admin/masters/designs/${item.id}`}>
                    {item.origin === "customer" ? "Referensi customer" : "Buka file"}
                  </Link>
                </article>
              ))
            ) : (
              <p className="empty-copy">Belum ada file 3D. Upload privat akan ditampilkan di sini.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
