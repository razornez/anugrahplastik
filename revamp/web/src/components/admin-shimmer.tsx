import type { HTMLAttributes } from "react";

type AdminShimmerProps = Omit<HTMLAttributes<HTMLSpanElement>, "aria-hidden">;

/** A decorative, layout-stable loading placeholder for admin content. */
export function AdminShimmer({ className = "", ...props }: AdminShimmerProps) {
  return <span aria-hidden="true" className={`admin-shimmer ${className}`.trim()} {...props} />;
}
