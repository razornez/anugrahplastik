import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { addProspectNote, assignProspect } from "@/features/workspace/actions";
import { getProspects } from "@/features/workspace/service";

export const instant = false;

function prospectUrl(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  return `/admin/prospects?${search}`;
}

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string; q?: string; status?: string; cursor?: string; direction?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  const query = await searchParams;
  const data = await getProspects({
    selectedId: query.selected,
    search: query.q,
    status: query.status,
    cursor: query.cursor,
    direction: query.direction === "previous" ? "previous" : "next",
  });
  if (!data) return <div className="admin-notice">Database belum terhubung.</div>;

  return (
    <div className="prospects-page">
      <header className="workspace-topbar prospects-header">
        <div>
          <p className="eyebrow">Prospek</p>
          <h1>Permintaan yang masuk</h1>
          <span>Kelola konteks, penanggung jawab, dan tindak lanjut tanpa membangun pipeline terlalu dini.</span>
        </div>
      </header>
      <div className="prospects-workspace">
        <aside className="prospect-list" aria-label="Daftar prospek">
          <form className="prospect-list-head" method="get">
            <strong>{data.prospects.length} prospek</strong>
            <input name="q" defaultValue={query.q} placeholder="Cari nama atau nomor" aria-label="Cari prospek" />
            <select name="status" defaultValue={query.status ?? ""} aria-label="Status prospek">
              <option value="">Semua status</option>
              <option value="new">Baru</option>
            </select>
            <button type="submit">Cari</button>
          </form>
          {data.prospects.map((prospect) => (
            <Link
              key={prospect.id}
              href={prospectUrl({
                q: query.q,
                status: query.status,
                cursor: query.cursor,
                direction: query.direction,
                selected: prospect.id,
              })}
              aria-current={data.selected?.id === prospect.id ? "page" : undefined}
            >
              <span className="prospect-initial">{prospect.name.slice(0, 1)}</span>
              <span>
                <strong>{prospect.name}</strong>
                <small>{prospect.message}</small>
              </span>
              <time>{prospect.createdAt.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</time>
            </Link>
          ))}
          <nav className="directory-pagination" aria-label="Pindah halaman prospek">
            {data.hasPrevious ? (
              <Link
                href={prospectUrl({
                  q: query.q,
                  status: query.status,
                  cursor: data.previousCursor ?? undefined,
                  direction: "previous",
                })}
              >
                ← Sebelumnya
              </Link>
            ) : (
              <span>← Sebelumnya</span>
            )}
            <span>25 prospek per halaman</span>
            {data.hasNext ? (
              <Link
                href={prospectUrl({
                  q: query.q,
                  status: query.status,
                  cursor: data.nextCursor ?? undefined,
                  direction: "next",
                })}
              >
                Berikutnya →
              </Link>
            ) : (
              <span>Berikutnya →</span>
            )}
          </nav>
        </aside>
        <section className="prospect-detail">
          {data.selected ? (
            <>
              <div className="detail-heading">
                <div>
                  <p className="eyebrow">{data.selected.source}</p>
                  <h2>{data.selected.name}</h2>
                  <a
                    href={`https://wa.me/${data.selected.phone.replace(/\D/g, "").replace(/^0/, "62")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {data.selected.phone}
                  </a>
                </div>
                <a className="wa-button" href={`/api/admin/prospects/${data.selected.id}/whatsapp`}>
                  Buka WhatsApp
                </a>
              </div>
              <p className="lead-message">{data.selected.message}</p>
              <form className="assignment-form" action={assignProspect}>
                <input type="hidden" name="leadId" value={data.selected.id} />
                <label>
                  Penanggung jawab
                  <select name="assignedUserId" defaultValue={data.selected.assignedUserId ?? ""}>
                    <option value="">Belum ditugaskan</option>
                    {data.members.map((member) => (
                      <option value={member.id} key={member.id}>
                        {member.name} · {member.role}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit">Simpan</button>
              </form>
              <div className="notes">
                <h3>Catatan internal</h3>
                {data.notes.length ? (
                  data.notes.map((note) => (
                    <article key={note.id}>
                      <strong>{note.authorName}</strong>
                      <p>{note.body}</p>
                      <time>{note.createdAt.toLocaleString("id-ID")}</time>
                    </article>
                  ))
                ) : (
                  <p className="empty-copy">Belum ada catatan.</p>
                )}
                <form action={addProspectNote}>
                  <input type="hidden" name="leadId" value={data.selected.id} />
                  <textarea name="body" rows={3} required placeholder="Tambahkan konteks atau hasil tindak lanjut…" />
                  <button type="submit">Simpan catatan</button>
                </form>
              </div>
            </>
          ) : (
            <p className="empty-copy">Pilih prospek untuk melihat detail.</p>
          )}
        </section>
      </div>
    </div>
  );
}
