import { AdminPageHeader } from "@/components/admin-page-header";
import { notFound } from "next/navigation";
import { DesignModelViewer } from "@/components/design-model-viewer";
import { requireOperationsAccess } from "@/features/operations/access";
import { getDesignFile } from "@/features/operations/service";

export const instant = false;

function previewFormat(value: string): value is "stl" | "obj" | "glb" {
  return value === "stl" || value === "obj" || value === "glb";
}

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relation(file: Awaited<ReturnType<typeof getDesignFile>>) {
  if (!file) return "Belum ditautkan";
  return (
    [file.productName, file.mouldName, file.customerName, file.transactionReference].filter(Boolean).join(" · ") ||
    "Belum ditautkan"
  );
}

export default async function DesignPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOperationsAccess();
  const { id } = await params;
  const file = await getDesignFile(id);
  if (!file) notFound();
  const canPreview = previewFormat(file.format);
  return (
    <section className="operations-page design-preview-page">
      <AdminPageHeader
        title={file.originalName}
        description={`${relation(file)} · ${file.origin === "customer" ? "Referensi customer" : "File internal"}`}
        back={{ href: "/admin/masters/designs", label: "Kembali ke file 3D" }}
      />
      <div className="design-preview-layout">
        <div className="design-preview-layout__viewer">
          {canPreview ? (
            <DesignModelViewer
              fileId={file.id}
              format={file.format as "stl" | "obj" | "glb"}
              hasThumbnail={Boolean(file.thumbnailStoragePath)}
            />
          ) : (
            <section className="design-cad-placeholder">
              <span>{file.format.toUpperCase()}</span>
              <h2>File sumber CAD</h2>
              <p>
                Format ini belum dapat dipratinjau langsung di browser. Unduh file untuk membukanya dengan perangkat
                lunak teknik, atau unggah GLB sebagai preview ringan.
              </p>
            </section>
          )}
        </div>
        <aside className="design-preview-meta" aria-label="Informasi file desain">
          <div className="design-preview-meta__primary">
            <span>{file.format.toUpperCase()}</span>
            <strong>Versi {file.version}</strong>
          </div>
          <dl>
            <div>
              <dt>Ukuran</dt>
              <dd>{fileSize(file.byteSize)}</dd>
            </div>
            <div>
              <dt>Jenis file</dt>
              <dd>
                {file.fileKind === "preview" ? "Preview" : file.fileKind === "reference" ? "Referensi" : "Sumber kerja"}
              </dd>
            </div>
            <div>
              <dt>Material</dt>
              <dd>{file.materialName ?? "Belum ditentukan"}</dd>
            </div>
            <div>
              <dt>Deskripsi</dt>
              <dd>{file.description ?? "Belum ada deskripsi file."}</dd>
            </div>
            <div>
              <dt>Tautan kerja</dt>
              <dd>{relation(file)}</dd>
            </div>
            <div>
              <dt>Diunggah</dt>
              <dd>
                {new Intl.DateTimeFormat("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Jakarta",
                }).format(file.createdAt)}{" "}
                WIB
              </dd>
            </div>
          </dl>
          <details>
            <summary>Checksum file</summary>
            <code>{file.checksum}</code>
          </details>
          <a className="primary-action design-download" href={`/api/admin/design-files/${file.id}?download=1`}>
            Unduh file privat
          </a>
        </aside>
      </div>
    </section>
  );
}
