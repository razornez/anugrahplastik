import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import { CustomerProfileDialog } from "@/components/customer-profile-dialog";
import { MasterCreateDialog } from "@/components/master-create-dialog";
import { MasterRecordDialog } from "@/components/master-record-dialog";
import { DesignListThumbnail } from "@/components/design-list-thumbnail";
import { DesignDirectoryToolbar } from "@/components/design-directory-toolbar";
import { DesignUploadForm } from "@/components/design-upload-form";
import { DesignFileActions } from "@/components/design-file-manage-dialog";
import {
  createMaterial,
  createMould,
  createProduct,
  createSupplier,
  deleteMasterRecord,
  updateMasterRecord,
} from "@/features/operations/actions";
import {
  getMasterDirectoryPage,
  getDesignUploadOptions,
  masterKinds,
  type DirectoryQuery,
  type MasterKind,
} from "@/features/operations/service";
import { getCustomerProfiles } from "@/features/operations/customer-profile-service";
import { customerProfileComplete } from "@/features/operations/customer-profile";
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
  if (kind === "customers") return <CustomerProfileDialog triggerLabel="Tambah pelanggan" />;
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
  return null;
}

export default async function MasterDirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { kind: rawKind } = await params;
  if (!isKind(rawKind)) notFound();
  const user = await getSession();
  if (
    !user ||
    (user.role !== "admin" &&
      !(user.role === "sales" && rawKind === "designs") &&
      !(user.role === "sales" && rawKind === "customers"))
  )
    redirect("/admin");
  const query = await searchParams;
  const filters: DirectoryQuery = {
    query: query.q,
    status: query.status,
    order: query.order === "oldest" ? "oldest" : "newest",
    cursor: query.cursor,
    direction: query.direction === "previous" ? "previous" : "next",
    format: query.format,
    materialId: query.material,
  };
  const result = await getMasterDirectoryPage(rawKind, filters);
  const customerProfiles =
    rawKind === "customers" && result?.rows.length
      ? await getCustomerProfiles(result.rows.map((row) => row.id))
      : new Map();
  const designOptions = rawKind === "designs" ? await getDesignUploadOptions() : null;
  const label = labels[rawKind];
  return (
    <section className="operations-page master-directory">
      <AdminPageHeader
        title={label.title}
        description={label.description}
        back={{ href: "/admin/masters", label: "Kembali ke Data master" }}
        actions={
          rawKind === "designs" && designOptions ? (
            <DesignUploadForm options={designOptions} />
          ) : (
            <CreateAction kind={rawKind} />
          )
        }
      />
      {rawKind === "designs" ? (
        <DesignDirectoryToolbar
          initialQuery={filters.query ?? ""}
          initialStatus={filters.status ?? ""}
          initialFormat={filters.format ?? ""}
          initialMaterialId={filters.materialId ?? ""}
          initialOrder={filters.order ?? "newest"}
          materials={designOptions?.materials ?? []}
        />
      ) : (
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
          </select>
          <select name="order" defaultValue={filters.order}>
            <option value="newest">Terbaru</option>
            <option value="oldest">Terlama</option>
          </select>
          <button type="submit">Terapkan</button>
        </form>
      )}
      <section className="directory-list">
        <div className="directory-list__head">
          <strong>
            {result?.rows.length ?? 0} {label.singular} pada halaman ini
          </strong>
          <span>{rawKind === "designs" ? "File privat · maksimal 25 hasil" : "Maksimal 25 hasil"}</span>
        </div>
        {result?.rows.length ? (
          result.rows.map((row) => (
            <article key={row.id} className={rawKind === "designs" ? "design-list-row" : undefined}>
              {rawKind === "designs" ? (
                <Link
                  className="design-list-row__thumbnail"
                  href={`/admin/masters/designs/${row.id}`}
                  aria-label={`Buka preview ${row.title}`}
                >
                  <DesignListThumbnail
                    fileId={row.id}
                    format={row.code}
                    hasThumbnail={Boolean(row.thumbnailStoragePath)}
                    title={row.title}
                  />
                </Link>
              ) : (
                <span className="master-code">{row.code}</span>
              )}
              <div className={rawKind === "designs" ? "design-list-row__copy" : undefined}>
                <strong>{row.title}</strong>
                <small>
                  {rawKind === "designs"
                    ? row.description ||
                      [row.materialName ? `Material: ${row.materialName}` : null, row.detail]
                        .filter(Boolean)
                        .join(" · ") ||
                      "Belum ada deskripsi atau relasi kerja."
                    : rawKind === "customers" && customerProfiles.get(row.id)
                      ? customerProfileComplete(customerProfiles.get(row.id)!)
                        ? row.detail
                        : `${row.detail} · Lengkapi data`
                      : row.detail}
                </small>
              </div>
              {rawKind === "designs" ? (
                <div className="design-list-row__actions">
                  <em className={`directory-status directory-status--${row.status}`}>
                    {row.status === "active" ? "Aktif" : row.status}
                  </em>
                  {designOptions && row.updatedAt ? (
                    <DesignFileActions
                      file={{
                        id: row.id,
                        originalName: row.title,
                        format: row.format ?? row.code.toLowerCase(),
                        origin: row.origin ?? row.status,
                        fileKind: row.fileKind ?? "source",
                        description: row.description ?? null,
                        productId: row.productId ?? null,
                        mouldId: row.mouldId ?? null,
                        customerId: row.customerId ?? null,
                        transactionId: row.transactionId ?? null,
                        materialId: row.materialId ?? null,
                        updatedAt: row.updatedAt.toISOString(),
                      }}
                      options={designOptions}
                      canDelete={user.role === "admin"}
                      detailHref={`/admin/masters/designs/${row.id}`}
                    />
                  ) : null}
                </div>
              ) : (
                <>
                  <em className={`directory-status directory-status--${row.status}`}>
                    {row.status === "active" ? "Aktif" : row.status}
                  </em>
                  {rawKind === "customers" && customerProfiles.get(row.id) ? (
                    <CustomerProfileDialog
                      canDelete={user.role === "admin"}
                      deleteAction={deleteMasterRecord}
                      profile={customerProfiles.get(row.id)}
                      triggerLabel="Kelola"
                    />
                  ) : (
                    <MasterRecordDialog
                      id={row.id}
                      kind={rawKind}
                      title={row.title}
                      status={row.status}
                      updateAction={updateMasterRecord}
                      deleteAction={deleteMasterRecord}
                    />
                  )}
                </>
              )}
            </article>
          ))
        ) : (
          <div className="directory-empty">
            <p className="empty-copy">
              {filters.query || filters.status || filters.format || filters.materialId
                ? `Tidak ada ${label.singular} yang cocok dengan pencarian atau filter ini.`
                : `Belum ada ${label.singular} yang tersimpan.`}
            </p>
            {filters.query || filters.status || filters.format || filters.materialId ? (
              <Link href={linkFor(rawKind, { order: filters.order })}>Hapus pencarian dan filter</Link>
            ) : rawKind === "designs" ? (
              <span>Gunakan tombol “Unggah file 3D” di bagian atas.</span>
            ) : null}
          </div>
        )}
      </section>
      <nav className="directory-pagination" aria-label="Pindah halaman daftar">
        {result?.hasPrevious ? (
          <Link
            href={linkFor(rawKind, {
              q: filters.query,
              status: filters.status,
              format: filters.format,
              material: filters.materialId,
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
              format: filters.format,
              material: filters.materialId,
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
