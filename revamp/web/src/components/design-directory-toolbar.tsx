"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type MaterialOption = { id: string; label: string };

type DesignDirectoryToolbarProps = {
  initialQuery: string;
  initialStatus: string;
  initialFormat: string;
  initialMaterialId: string;
  initialOrder: "newest" | "oldest";
  materials: MaterialOption[];
};

type DirectoryFilters = {
  status: string;
  format: string;
  materialId: string;
  order: "newest" | "oldest";
};

const emptyFilters: DirectoryFilters = {
  status: "",
  format: "",
  materialId: "",
  order: "newest",
};

function activeFilterCount(filters: DirectoryFilters) {
  return (
    Number(Boolean(filters.status)) +
    Number(Boolean(filters.format)) +
    Number(Boolean(filters.materialId)) +
    Number(filters.order === "oldest")
  );
}

export function DesignDirectoryToolbar({
  initialQuery,
  initialStatus,
  initialFormat,
  initialMaterialId,
  initialOrder,
  materials,
}: DesignDirectoryToolbarProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<DirectoryFilters>({
    status: initialStatus,
    format: initialFormat,
    materialId: initialMaterialId,
    order: initialOrder,
  });

  const apply = (nextQuery: string, nextFilters: DirectoryFilters) => {
    const params = new URLSearchParams();
    const normalizedQuery = nextQuery.trim();
    if (normalizedQuery) params.set("q", normalizedQuery);
    if (nextFilters.status) params.set("status", nextFilters.status);
    if (nextFilters.format) params.set("format", nextFilters.format);
    if (nextFilters.materialId) params.set("material", nextFilters.materialId);
    if (nextFilters.order === "oldest") params.set("order", "oldest");
    router.push(`/admin/masters/designs${params.size ? `?${params.toString()}` : ""}`);
  };

  const filterCount = activeFilterCount(filters);
  const hasActiveControls = Boolean(query.trim()) || filterCount > 0;

  return (
    <>
      <form
        className="design-directory-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          apply(query, filters);
        }}
      >
        <label className="sr-only" htmlFor="design-directory-search">
          Cari nama atau kode file 3D
        </label>
        <input
          id="design-directory-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari nama atau kode file 3D"
        />
        <button className="design-directory-toolbar__search" type="submit">
          Cari
        </button>
        <div className="design-directory-toolbar__filter-row">
          <button
            className="design-directory-toolbar__filter"
            type="button"
            ref={filterTriggerRef}
            onClick={() => dialogRef.current?.showModal()}
            aria-haspopup="dialog"
          >
            Filter & urutkan
            {filterCount ? <strong>{filterCount}</strong> : null}
          </button>
          {hasActiveControls ? (
            <button
              className="design-directory-toolbar__reset"
              type="button"
              onClick={() => {
                setQuery("");
                setFilters(emptyFilters);
                apply("", emptyFilters);
              }}
            >
              Reset
            </button>
          ) : null}
        </div>
      </form>

      <dialog
        className="master-dialog design-directory-filter-dialog"
        ref={dialogRef}
        onClose={() => filterTriggerRef.current?.focus()}
        aria-labelledby="design-filter-title"
      >
        <form method="dialog" className="master-dialog__close">
          <button type="submit" aria-label="Tutup filter">
            ×
          </button>
        </form>
        <div className="master-dialog__body">
          <p className="eyebrow">File 3D</p>
          <h2 id="design-filter-title">Filter & urutkan</h2>
          <p>Atur daftar tanpa memenuhi ruang kerja utama.</p>
          <form
            className="design-directory-filter-form"
            onSubmit={(event) => {
              event.preventDefault();
              dialogRef.current?.close();
              apply(query, filters);
            }}
          >
            <label>
              Status asal file
              <select
                value={filters.status}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="">Semua status</option>
                <option value="customer">Customer</option>
                <option value="internal">Internal</option>
              </select>
            </label>
            <label>
              Format file
              <select
                value={filters.format}
                onChange={(event) => setFilters((current) => ({ ...current, format: event.target.value }))}
              >
                <option value="">Semua format</option>
                <option value="glb">GLB</option>
                <option value="stl">STL</option>
                <option value="obj">OBJ</option>
                <option value="step">STEP</option>
                <option value="stp">STP</option>
                <option value="iges">IGES</option>
                <option value="dxf">DXF</option>
                <option value="dwg">DWG</option>
              </select>
            </label>
            <label>
              Material
              <select
                value={filters.materialId}
                onChange={(event) => setFilters((current) => ({ ...current, materialId: event.target.value }))}
              >
                <option value="">Semua material</option>
                {materials.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Urutan
              <select
                value={filters.order}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, order: event.target.value as DirectoryFilters["order"] }))
                }
              >
                <option value="newest">Terbaru</option>
                <option value="oldest">Terlama</option>
              </select>
            </label>
            <div className="design-directory-filter-form__actions">
              <button
                className="design-directory-toolbar__reset"
                type="button"
                onClick={() => setFilters(emptyFilters)}
              >
                Atur ulang filter
              </button>
              <button className="master-primary-action" type="submit">
                Terapkan
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
