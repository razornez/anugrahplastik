import { AdminShimmer } from "@/components/admin-shimmer";
import { EmailDetailShimmer } from "@/components/email-loading-shimmer";

export default function EmailLoading() {
  return (
    <section className="admin-page" aria-busy="true" aria-label="Memuat Email CS">
      <p className="admin-eyebrow">LAYANAN PELANGGAN</p>
      <h1>Email CS</h1>
      <div className="email-page-loading">
        <aside className="email-page-loading__list" aria-hidden="true">
          <AdminShimmer />
          <AdminShimmer />
          <AdminShimmer />
          <AdminShimmer />
        </aside>
        <EmailDetailShimmer label="Memuat percakapan yang tersimpan" />
      </div>
    </section>
  );
}
