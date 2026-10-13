import { AdminShimmer } from "@/components/admin-shimmer";

export default function AdminLoading() {
  return (
    <section className="admin-route-loading" aria-busy="true" aria-label="Memuat halaman">
      <header>
        <AdminShimmer style={{ width: "min(240px, 68%)", height: 30 }} />
        <AdminShimmer style={{ width: "min(440px, 88%)", height: 16 }} />
      </header>
      <div className="admin-route-loading__toolbar">
        <AdminShimmer style={{ width: 120, height: 44 }} />
        <AdminShimmer style={{ width: 120, height: 44 }} />
      </div>
      <div className="admin-route-loading__content">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index}>
            <AdminShimmer style={{ width: 44, height: 44 }} />
            <span>
              <AdminShimmer style={{ width: `${Math.max(42, 76 - index * 7)}%`, height: 16 }} />
              <AdminShimmer style={{ width: `${Math.max(34, 61 - index * 5)}%`, height: 12 }} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
