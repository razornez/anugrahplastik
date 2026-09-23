import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MasterCreateDialog } from "@/components/master-create-dialog";
import {
  createCustomer,
  createMaterial,
  createMould,
  createProduct,
  createSupplier,
} from "@/features/operations/actions";
import {
  getMasterDirectoryPage,
  masterKinds,
  type DirectoryQuery,
  type MasterKind,
} from "@/features/operations/service";
import { getSession } from "@/lib/auth/session";

export const instant = false;

const labels: Record<MasterKind, { singular: string; title: string; description: string }> = {
  customers: {
    singular: "pelanggan",
    title: "Pelanggan",
    description: "Customer yang dapat dipilih saat membuat transaksi.",
  },
  suppliers: {
    singular: "pemasok",
    title: "Pemasok",
    description: "Sumber bahan dan kebutuhan kerja yang dapat ditelusuri.",
  },
  materials: { singular: "material", title: "Material", description: "Polimer, grade, dan spesifikasi dasar bahan." },
  products: { singular: "barang", title: "Barang", description: "Produk, spare part, dan satuan kerja." },
  moulds: { singular: "mould", title: "Mould", description: "Peralatan cetak yang terhubung ke pekerjaan." },
  designs: {
    singular: "file 3D",
    title: "File 3D",
    description: "Sumber kerja dan referensi customer yang disimpan privat.",
  },
};

function isKind(value: string): value is MasterKind {
  return masterKinds.includes(value as MasterKind);
}
function linkFor(kind: MasterKind, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return `/admin/masters/${kind}${query.size ? `?${query}` : ""}`;
}

function CreateAction({ kind }: { kind: MasterKind }) {
  if (kind === "customers")
    return (
      <MasterCreateDialog label="Tambah pelanggan" action={createCustomer}>
        <label>
          Nama pelanggan
          <input name="name" required autoFocus />
        </label>
        <label>
          Email
          <input name="email" type="email" />
        </label>
        <label>
          WhatsApp
          <input name="phone" inputMode="tel" />
        </label>
      </MasterCreateDialog>
    );
  if (kind === "suppliers")
    return (
      <MasterCreateDialog label="Tambah pemasok" action={createSupplier}>
        <label>
          Nama pemasok
          <input name="name" required autoFocus />
        </label>
      </MasterCreateDialog>
    );
  if (kind === "materials")
    return (
      <MasterCreateDialog label="Tambah material" action={createMaterial}>
        <label>
          Nama material
          <input name="name" required autoFocus />
        </label>
        <label>
          Keluarga polimer
          <input name="family" placeholder="Contoh: PP" required />
        </label>
        <label>
          Grade
          <input name="grade" />
        </label>
      </MasterCreateDialog>
    );
  if (kind === "products")
    return (
      <MasterCreateDialog label="Tambah barang" action={createProduct}>
        <label>
          Nama barang
          <input name="name" required autoFocus />
        </label>
        <label>
          Berat per pcs (gram)
          <input name="weight" type="number" min="0" step="0.001" />
        </label>
      </MasterCreateDialog>
    );
  if (kind === "moulds")
    return (
      <MasterCreateDialog label="Tambah mould" action={createMould}>
        <label>
          Nama mould
          <input name="name" required autoFocus />
        </label>
        <label>
          Jumlah cavity
          <input name="cavities" type="number" min="1" />
        </label>
      </MasterCreateDialog>
    );
  return (
    <Link className="master-primary-action" href="/admin/masters/designs">
      Kelola file 3D
    </Link>
  );
}

export default async function MasterDirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const { kind: rawKind } = await params;
  if (!isKind(rawKind)) notFound();
  const query = await searchParams;
  const filters: DirectoryQuery = {
    query: query.q,
    status: query.status,
    order: query.order === "oldest" ? "oldest" : "newest",
    cursor: query.cursor,
    direction: query.direction === "previous" ? "previous" : "next",
  };
  const result = await getMasterDirectoryPage(rawKind, filters);
  const label = labels[rawKind];
  return (
    <section className="operations-page master-directory">
      <header className="master-directory__head">
        <div>
          <Link className="back-link" href="/admin/masters">
            ← Data master
          </Link>
          <p className="eyebrow">Data master</p>
          <h1>{label.title}</h1>
          <p>{label.description}</p>
        </div>
        <CreateAction kind={rawKind} />
      </header>
      <form className="directory-toolbar" method="get">
        <label className="sr-only" htmlFor="directory-search">
          Cari {label.singular}
        </label>
        <input
          id="directory-search"
          name="q"
          defaultValue={filters.query}
          placeholder={`Cari nama atau kode ${label.singular}`}
        />
        <select name="status" defaultValue={filters.status}>
          <option value="">Semua status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
          {rawKind === "moulds" ? <option value="planned">Direncanakan</option> : null}
          {rawKind === "designs" ? (
            <>
              <option value="customer">Customer</option>
              <option value="internal">Internal</option>
            </>
          ) : null}
        </select>
        <select name="order" defaultValue={filters.order}>
          <option value="newest">Terbaru</option>
          <option value="oldest">Terlama</option>
        </select>
        <button type="submit">Terapkan</button>
      </form>
      <section className="directory-list">
        <div className="directory-list__head">
          <strong>{result?.rows.length ?? 0} data pada halaman ini</strong>
          <span>Menampilkan maksimal 25 data</span>
        </div>
        {result?.rows.length ? (
          result.rows.map((row) => (
            <article key={row.id}>
              <span className="master-code">{row.code}</span>
              <div>
                <strong>{row.title}</strong>
                <small>{row.detail}</small>
              </div>
              <em>{row.status === "active" ? "Aktif" : row.status}</em>
              {rawKind === "designs" ? <Link href={`/admin/masters/designs/${row.id}`}>Buka</Link> : null}
            </article>
          ))
        ) : (
          <p className="empty-copy">Belum ada {label.singular} yang sesuai pencarian.</p>
        )}
      </section>
      <nav className="directory-pagination" aria-label="Pindah halaman daftar">
        {result?.hasPrevious ? (
          <Link
            href={linkFor(rawKind, {
              q: filters.query,
              status: filters.status,
              order: filters.order,
              cursor: result.previousCursor ?? undefined,
              direction: "previous",
            })}
          >
            ← Sebelumnya
          </Link>
        ) : (
          <span>← Sebelumnya</span>
        )}
        <span>25 data per halaman</span>
        {result?.hasNext ? (
          <Link
            href={linkFor(rawKind, {
              q: filters.query,
              status: filters.status,
              order: filters.order,
              cursor: result.nextCursor ?? undefined,
              direction: "next",
            })}
          >
            Berikutnya →
          </Link>
        ) : (
          <span>Berikutnya →</span>
        )}
      </nav>
    </section>
  );
}
