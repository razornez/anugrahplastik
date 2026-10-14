"use client";

import { useEffect, useState, useTransition } from "react";
import { continueCurrentSession } from "@/features/auth/actions";

export function SessionExpiryBanner({ initialExpiresAt }: { initialExpiresAt: string }) {
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);
  const [remaining, setRemaining] = useState(() => new Date(initialExpiresAt).getTime() - Date.now());
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const update = () => setRemaining(new Date(expiresAt).getTime() - Date.now());
    update();
    const interval = window.setInterval(update, 15_000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);
  if (remaining > 5 * 60 * 1_000 || remaining <= 0) return null;
  return (
    <aside className="admin-session-banner" role="status">
      <span>Sesi akan berakhir dalam {Math.max(1, Math.ceil(remaining / 60_000))} menit.</span>
      <button
        aria-busy={pending}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await continueCurrentSession();
            if (result) setExpiresAt(result.expiresAt);
          })
        }
        type="button"
      >
        {pending ? "Memperpanjang…" : "Lanjutkan sesi"}
      </button>
    </aside>
  );
}
