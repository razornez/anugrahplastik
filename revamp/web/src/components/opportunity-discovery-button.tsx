"use client";

import { useActionState } from "react";
import { runOpportunityDiscoveryAction } from "@/features/analytics/opportunity-discovery-actions";

export function OpportunityDiscoveryButton({
  used,
  limit,
  available,
}: {
  used: number;
  limit: number;
  available: number;
}) {
  const [message, action, pending] = useActionState(runOpportunityDiscoveryAction, null);
  if (available === 0)
    return (
      <p className="opportunity-discovery-control opportunity-discovery-control--notice">
        Pemeriksaan tambahan bulan ini sudah selesai. {used}/{limit} pencarian terpakai; sisa jatah disimpan untuk audit
        peringkat berikutnya.
      </p>
    );
  return (
    <form action={action} className="opportunity-discovery-control">
      <p>
        Jatah bulan ini: {used}/{limit} pencarian terpakai. Tersedia {available} untuk pemeriksaan tambahan.
      </p>
      <label>
        <input type="checkbox" name="confirmed" required disabled={pending || available === 0} />
        Saya memahami pemeriksaan ini dapat memakai hingga 4 pencarian SerpApi dan tidak mengubah audit peringkat lama.
      </label>
      <button type="submit" disabled={pending || available === 0}>
        {pending ? "Sedang memeriksa…" : "Periksa peluang sekarang"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
