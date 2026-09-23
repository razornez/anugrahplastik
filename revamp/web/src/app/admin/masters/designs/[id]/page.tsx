import Link from "next/link";
import { notFound } from "next/navigation";
import { DesignModelViewer } from "@/components/design-model-viewer";
import { requireOperationsAccess } from "@/features/operations/access";
import { getDesignFile } from "@/features/operations/service";

export const instant = false;

function previewFormat(value: string): value is "stl" | "obj" | "glb" {
  return value === "stl" || value === "obj" || value === "glb";
}

export default async function DesignPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOperationsAccess();
  const { id } = await params;
  const file = await getDesignFile(id);
  if (!file) notFound();
  const canPreview = previewFormat(file.format);
  return (
    <section className="operations-page design-preview-page">
      <Link href="/admin/masters">← Kembali ke data master</Link>
      <header>
        <p className="eyebrow">Desain 3D privat</p>
        <h1>{file.originalName}</h1>
        <p>
          {file.productName ?? file.customerName ?? "Belum ditautkan"} ·{" "}
          {file.origin === "customer" ? "Referensi customer" : "File internal"}
        </p>
      </header>
      {canPreview ? (
        <DesignModelViewer fileId={file.id} format={file.format as "stl" | "obj" | "glb"} />
      ) : (
        <section className="transaction-panel">
          <h2>File sumber CAD</h2>
          <p className="transaction-panel-copy">
            Format {file.format.toUpperCase()} tidak dirender di browser. Unduh file ini untuk dibuka memakai perangkat
            lunak teknik yang sesuai, atau tautkan preview GLB untuk peninjauan cepat.
          </p>
        </section>
      )}
      <a className="primary-action design-download" href={`/api/admin/design-files/${file.id}?download=1`}>
        Unduh file privat
      </a>
    </section>
  );
}
