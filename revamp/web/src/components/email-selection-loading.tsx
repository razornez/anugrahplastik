"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { EmailDetailShimmer } from "@/components/email-loading-shimmer";

export const emailSelectionLoadingEvent = "ap:email-selection-loading";

/** Displays immediate feedback between selecting a list row and receiving its detail payload. */
export function EmailSelectionLoading() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [pendingFromRoute, setPendingFromRoute] = useState<string | null>(null);

  useEffect(() => {
    const begin = () => setPendingFromRoute(routeKey);
    window.addEventListener(emailSelectionLoadingEvent, begin);
    return () => window.removeEventListener(emailSelectionLoadingEvent, begin);
  }, [routeKey]);

  if (pendingFromRoute !== routeKey) return null;

  return (
    <div className="email-selection-loading" data-testid="email-selection-loading">
      <EmailDetailShimmer label="Membuka detail email" />
    </div>
  );
}
