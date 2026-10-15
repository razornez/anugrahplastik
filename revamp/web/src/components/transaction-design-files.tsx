"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ViewerFormat } from "@/components/design-model-viewer";

const DesignModelViewer = dynamic(
  () => import("@/components/design-model-viewer").then((module) => module.DesignModelViewer),
  { ssr: false, loading: () => <p role="status">Memuat pratinjau 3D…</p> },
);

type RelatedFile = {
  id: string;
  originalName: string;
  format: string;
  version: number;
  checksum: string;
  thumbnailStoragePath: string | null;
  derivedPreviewStoragePath: string | null;
  derivedPreviewSourceChecksum: string | null;
};

const previewFormats = new Set(["stl", "obj", "glb", "step", "stp", "iges", "igs"]);

export function TransactionDesignFiles({ files }: { files: RelatedFile[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!files.length) return null;
  return (
    <section className="transaction-related-designs" aria-labelledby="transaction-design-title">
      <h2 id="transaction-design-title">File 3D proyek</h2>
      <p>Hanya file yang ditautkan langsung ke transaksi ini.</p>
      <ul>
        {files.map((file) => (
          <li key={file.id}>
            <div>
              <strong>{file.originalName}</strong>
              <small>
                {file.format.toUpperCase()} · versi {file.version}
              </small>
            </div>
            {previewFormats.has(file.format) ? (
              <button
                aria-expanded={openId === file.id}
                onClick={() => setOpenId(openId === file.id ? null : file.id)}
                type="button"
              >
                {openId === file.id ? "Tutup preview" : "Preview 3D"}
              </button>
            ) : (
              <Link href={`/admin/masters/designs/${file.id}`}>Lihat file</Link>
            )}
            {openId === file.id ? (
              <div className="transaction-related-designs__preview">
                <DesignModelViewer
                  fileId={file.id}
                  format={file.format as ViewerFormat}
                  hasThumbnail={Boolean(file.thumbnailStoragePath)}
                  sourceChecksum={file.checksum}
                  derivedPreviewAvailable={Boolean(
                    file.derivedPreviewStoragePath && file.derivedPreviewSourceChecksum === file.checksum,
                  )}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
