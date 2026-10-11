"use client";

import { useActionState } from "react";
import { runSeoAuditAction } from "@/features/analytics/seo-audit-actions";

export function SeoAuditButton() {
  const [message, action, pending] = useActionState(runSeoAuditAction, null);
  return (
    <form action={action} className="growth-seo-run">
      <button type="submit" disabled={pending}>
        {pending ? "Memeriksa…" : "Periksa sekarang"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
