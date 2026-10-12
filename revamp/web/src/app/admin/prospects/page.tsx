import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import { MarketingWorkspaceNav } from "@/components/marketing-workspace-nav";
import { addProspectNote, assignProspect, updateProspectStatus } from "@/features/workspace/actions";
import { prospectSourceLabel } from "@/features/workspace/prospect-display";
import { prospectStatusLabel, prospectStatuses } from "@/features/workspace/prospect-status";
import { getProspects } from "@/features/workspace/service";
import { getSession } from "@/lib/auth/session";
import { businessSource } from "@/features/analytics/business-discovery-model";
import "./prospects.css";

export const instant = false;

type ProspectQuery = {
  selected?: string;
  q?: string;
  status?: string;
  cursor?: string;
  direction?: string;
  error?: string;
  origin?: string;
};

function prospectUrl(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const value = search.toString();
  return `/admin/prospects${value ? `?${value}` : ""}`;
}

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<ProspectQuery> }) {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  const query = await searchParams;
  const data = await getProspects({
    selectedId: query.selected,
    search: query.q,
    status: query.status,
    cursor: query.cursor,
    direction: query.direction === "previous" ? "previous" : "next",
    origin: query.origin,
    allowResearch: ["admin", "sales"].includes(user.role),
  });
  if (!data) return <div className="admin-notice">Database belum terhubung.</div>;

  const viewParameters = { q: query.q, status: query.status, origin: query.origin };
  const selected = data.selected;
  const isResearch = selected?.source === businessSource;
  const whatsAppReady = selected && Boolean(selected.phone);

  return (
    <div className="prospects-page">
      <AdminPageHeader
        className="prospects-header"
        title="Prospek dan permintaan"
        description="Tinjau permintaan masuk, calon pelanggan, dan tindak lanjut tim."
      />
      <MarketingWorkspaceNav current="/admin/prospects" role={user.role} />

      <section className="prospects-summary" aria-label="Ringkasan permintaan">
        <article>
          <span>Prospek tercatat</span>
          <strong>{data.summary.total}</strong>
          <small>Sesuai jenis sumber yang dipilih</small>
        </article>
        <article>
          <span>Perlu penanggung jawab</span>
          <strong>{data.summary.unassigned}</strong>
          <small>Pilih anggota tim untuk menindaklanjuti</small>
        </article>
        <article>
          <span>Memiliki catatan</span>
          <strong>{data.summary.withNotes}</strong>
          <small>Prospek yang sudah diberi catatan internal</small>
        </article>
      </section>

      <div className="prospects-workspace">
        <section className="prospect-list" aria-label="Daftar prospek" id="daftar-prospek">
          <div className="prospect-list__intro">
            <div>
              <p className="eyebrow">DAFTAR PROSPEK</p>
              <h2>Pilih yang ingin ditinjau</h2>
            </div>
            <span>{data.prospects.length} di halaman ini</span>
          </div>
          <form className="prospect-list-head" method="get">
            <label className="prospect-search-field">
              Cari prospek
              <input name="q" defaultValue={query.q} placeholder="Nama, telepon, atau email" />
            </label>
            {["admin", "sales"].includes(user.role) ? (
              <label className="prospect-status-field">
                Jenis sumber
                <select name="origin" defaultValue={query.origin ?? ""}>
                  <option value="">Semua sumber</option>
                  <option value="incoming">Permintaan masuk</option>
                  <option value="research">Calon pelanggan hasil riset</option>
                </select>
              </label>
            ) : null}
            <label className="prospect-status-field">
              Status
              <select name="status" defaultValue={query.status ?? ""}>
                <option value="">Semua status</option>
                {prospectStatuses.map((status) => (
                  <option key={status} value={status}>
                    {prospectStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Cari</button>
          </form>
          <div className="prospect-list__items">
            {data.prospects.map((prospect) => (
              <Link
                key={prospect.id}
                href={`${prospectUrl({
                  ...viewParameters,
                  cursor: query.cursor,
                  direction: query.direction,
                  selected: prospect.id,
                })}#prospect-detail`}
                aria-current={selected?.id === prospect.id ? "page" : undefined}
              >
                <span className="prospect-initial" aria-hidden="true">
                  {prospect.name.slice(0, 1)}
                </span>
                <span className="prospect-list__body">
                  <span className="prospect-list__name">
                    <strong>{prospect.name}</strong>
                    <time dateTime={prospect.createdAt.toISOString()}>
                      {prospect.createdAt.toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        timeZone: "Asia/Jakarta",
                      })}
                    </time>
                  </span>
                  <span className="prospect-list__message">{prospect.message}</span>
                  <span className="prospect-list__meta">
                    <span>{prospectSourceLabel(prospect.source)}</span>
                    <span className={`prospect-status prospect-status--${prospect.status}`}>
                      {prospectStatusLabel(prospect.status)}
                    </span>
                    <span>
                      {prospect.assignedName ? `Ditangani ${prospect.assignedName}` : "Belum ada penanggung jawab"}
                    </span>
                  </span>
                </span>
              </Link>
            ))}
            {!data.prospects.length ? (
              <div className="prospect-empty">
                <strong>
                  {query.q || query.status || query.origin
                    ? "Tidak ada hasil yang cocok"
                    : "Belum ada prospek di daftar ini"}
                </strong>
                <p>
                  {query.q || query.status || query.origin
                    ? "Coba kata kunci lain atau hapus filter untuk melihat semua prospek."
                    : "Permintaan yang dikirim pelanggan akan tampil di sini."}
                </p>
                {query.q || query.status || query.origin ? (
                  <Link href={prospectUrl({})}>Hapus pencarian dan filter</Link>
                ) : null}
              </div>
            ) : null}
          </div>
          {data.hasPrevious || data.hasNext ? (
            <nav className="directory-pagination" aria-label="Pindah halaman prospek">
              {data.hasPrevious ? (
                <Link
                  href={prospectUrl({
                    ...viewParameters,
                    cursor: data.previousCursor ?? undefined,
                    direction: "previous",
                  })}
                >
                  ← Sebelumnya
                </Link>
              ) : (
                <span />
              )}
              <span>25 per halaman</span>
              {data.hasNext ? (
                <Link
                  href={prospectUrl({ ...viewParameters, cursor: data.nextCursor ?? undefined, direction: "next" })}
                >
                  Berikutnya →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>

        <section className="prospect-detail" id="prospect-detail" aria-label="Rincian prospek">
          {selected ? (
            <>
              <div className="detail-heading">
                <div>
                  <p className="eyebrow">{isResearch ? "CALON PELANGGAN · HASIL RISET" : "PERMINTAAN PELANGGAN"}</p>
                  <h2>{selected.name}</h2>
                  <p>
                    {prospectSourceLabel(selected.source)} ·{" "}
                    {selected.createdAt.toLocaleString("id-ID", {
                      dateStyle: "long",
                      timeStyle: "short",
                      timeZone: "Asia/Jakarta",
                    })}{" "}
                    WIB
                  </p>
                </div>
                {whatsAppReady ? (
                  <a className="wa-button" href={`/api/admin/prospects/${selected.id}/whatsapp`}>
                    Buka WhatsApp
                  </a>
                ) : null}
              </div>
              {selected.phone ? (
                <p className="prospect-contact">Telepon: {selected.phone}</p>
              ) : selected.email ? (
                <p className="prospect-contact">
                  Email: <a href={`mailto:${selected.email}`}>{selected.email}</a>
                </p>
              ) : (
                <p className="prospect-contact">Kontak belum tersedia</p>
              )}
              <a className="prospect-other-link" href="#daftar-prospek">
                ↑ Kembali ke daftar
              </a>

              <section
                className="prospect-message-panel"
                aria-label={isResearch ? "Ringkasan riset perusahaan" : "Pesan pelanggan"}
              >
                <span>{isResearch ? "Ringkasan riset · bukan pesan pelanggan" : "Isi permintaan"}</span>
                <p>{selected.message}</p>
              </section>

              {["admin", "sales"].includes(user.role) ? (
                <form className="prospect-status-form" action={updateProspectStatus}>
                  <input type="hidden" name="leadId" value={selected.id} />
                  <label>
                    Status tindak lanjut
                    <select name="status" defaultValue={selected.status}>
                      {prospectStatuses.map((status) => (
                        <option key={status} value={status}>
                          {prospectStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit">Simpan status</button>
                </form>
              ) : null}

              <form className="assignment-form" action={assignProspect}>
                <input type="hidden" name="leadId" value={selected.id} />
                <label>
                  Penanggung jawab
                  <select name="assignedUserId" defaultValue={selected.assignedUserId ?? ""}>
                    <option value="">Belum ada penanggung jawab</option>
                    {data.members
                      .filter((member) => !isResearch || ["admin", "sales"].includes(member.role))
                      .map((member) => (
                        <option value={member.id} key={member.id}>
                          {member.name} · {member.role}
                        </option>
                      ))}
                  </select>
                </label>
                <button type="submit">Simpan penanggung jawab</button>
              </form>

              <div className="notes">
                <div className="notes__heading">
                  <h3>Catatan tindak lanjut</h3>
                  <span>{data.notes.length} catatan</span>
                </div>
                {data.notes.length ? (
                  data.notes.map((note) => (
                    <article key={note.id}>
                      <div>
                        <strong>{note.authorName}</strong>
                        <time dateTime={note.createdAt.toISOString()}>
                          {note.createdAt.toLocaleString("id-ID", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "Asia/Jakarta",
                          })}{" "}
                          WIB
                        </time>
                      </div>
                      <p>{note.body}</p>
                    </article>
                  ))
                ) : (
                  <p className="notes__empty">Belum ada catatan. Simpan hasil percakapan pertama di bawah ini.</p>
                )}
                <form action={addProspectNote}>
                  <input type="hidden" name="leadId" value={selected.id} />
                  <label htmlFor="prospect-note">Tambah catatan internal</label>
                  <textarea
                    id="prospect-note"
                    name="body"
                    rows={3}
                    required
                    placeholder="Contoh: pelanggan akan mengirim ukuran dan foto produk."
                  />
                  <button type="submit">Simpan catatan</button>
                </form>
              </div>
            </>
          ) : (
            <div className="prospect-detail__empty">
              <strong>Belum ada permintaan yang dipilih</strong>
              <p>Pilih salah satu permintaan dari daftar untuk membaca pesan dan mencatat tindak lanjut.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
