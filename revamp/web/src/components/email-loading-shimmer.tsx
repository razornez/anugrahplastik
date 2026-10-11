import { AdminShimmer } from "@/components/admin-shimmer";

export function EmailDetailShimmer({ label = "Memuat detail email" }: { label?: string }) {
  return (
    <section aria-busy="true" aria-label={label} className="email-detail-shimmer">
      <span className="sr-only" role="status">
        {label}
      </span>
      <AdminShimmer className="email-detail-shimmer__eyebrow" />
      <AdminShimmer className="email-detail-shimmer__title" />
      <AdminShimmer className="email-detail-shimmer__title email-detail-shimmer__title--short" />
      <div className="email-detail-shimmer__metadata">
        <AdminShimmer />
        <AdminShimmer />
        <AdminShimmer />
        <AdminShimmer />
        <AdminShimmer />
        <AdminShimmer />
      </div>
      <div className="email-detail-shimmer__body">
        <AdminShimmer />
        <AdminShimmer />
        <AdminShimmer />
        <AdminShimmer className="email-detail-shimmer__line--short" />
      </div>
    </section>
  );
}

export function EmailEditorShimmer() {
  return (
    <div aria-busy="true" aria-label="Memuat editor email" className="email-editor-shimmer">
      <span className="sr-only" role="status">
        Memuat editor email
      </span>
      <div className="email-editor-shimmer__toolbar">
        <AdminShimmer />
        <AdminShimmer />
        <AdminShimmer />
        <AdminShimmer />
        <AdminShimmer />
      </div>
      <div className="email-editor-shimmer__canvas">
        <AdminShimmer />
        <AdminShimmer />
        <AdminShimmer className="email-detail-shimmer__line--short" />
      </div>
    </div>
  );
}
