"use client";

import { useFormStatus } from "react-dom";
import { refreshMailbox } from "@/features/integrations/actions";

function RefreshButton() {
  const { pending } = useFormStatus();
  return (
    <button className="admin-secondary-button" disabled={pending} type="submit" aria-live="polite">
      {pending ? "Memeriksa mailbox…" : "Segarkan sekarang"}
    </button>
  );
}

export function MailboxRefreshControl({ returnTo }: { returnTo: string }) {
  return (
    <form action={refreshMailbox} aria-busy={false} className="mailbox-refresh-control">
      <input type="hidden" name="returnTo" value={returnTo} />
      <RefreshButton />
    </form>
  );
}
