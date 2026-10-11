"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminShimmer } from "@/components/admin-shimmer";
import {
  disconnectCsMailbox,
  disconnectGoogleAds,
  runGoogleAdsAccessProbe,
  runCsMailboxHealthCheck,
} from "@/features/integrations/actions";

type IntegrationKind = "mail" | "google-ads";

type ActionResult = { ok: boolean; message: string };

export function IntegrationHealthControls({
  kind,
  connected,
  unavailableReason,
}: {
  kind: IntegrationKind;
  connected: boolean;
  unavailableReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const isMail = kind === "mail";
  const actionLabel = isMail ? "Uji ulang koneksi" : "Verifikasi akses API";

  function runHealthCheck() {
    setResult(null);
    startTransition(async () => {
      const next = isMail ? await runCsMailboxHealthCheck() : await runGoogleAdsAccessProbe();
      setResult(next);
      router.refresh();
    });
  }

  function runAdsProbe() {
    setResult(null);
    startTransition(async () => {
      const next = await runGoogleAdsAccessProbe();
      setResult(next);
      router.refresh();
    });
  }

  function disconnect() {
    if (!window.confirm("Putuskan koneksi ini? Kredensial tersimpan akan dihapus dari aplikasi.")) return;
    startTransition(async () => {
      if (isMail) await disconnectCsMailbox();
      else await disconnectGoogleAds();
    });
  }

  if (!connected) return null;
  return (
    <div aria-busy={pending} className="integration-health-actions">
      <button
        className={isMail ? "admin-primary-button" : "admin-secondary-button"}
        disabled={pending || Boolean(unavailableReason)}
        onClick={isMail ? runHealthCheck : runAdsProbe}
        title={unavailableReason}
        type="button"
      >
        {pending ? "Memeriksa…" : actionLabel}
      </button>
      <span aria-live="polite" className="integration-health-actions__result" role={result?.ok ? "status" : "alert"}>
        {pending ? <AdminShimmer className="integration-health-actions__shimmer" /> : null}
        {result?.message ?? unavailableReason ?? null}
      </span>
      <details className="integration-disconnect">
        <summary>Kelola koneksi tersimpan</summary>
        <p>
          Menghapus kredensial dari aplikasi. Gunakan hanya bila mailbox akan diganti atau koneksi memang tidak dipakai.
        </p>
        <button className="admin-link-button" disabled={pending} onClick={disconnect} type="button">
          Putuskan & hapus kredensial
        </button>
      </details>
    </div>
  );
}
