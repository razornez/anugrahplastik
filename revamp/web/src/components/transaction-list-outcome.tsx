"use client";

import { useEffect } from "react";
import { useAdminToast } from "@/components/admin-ui";
import { invalidateTransactionList } from "@/components/transaction-session-state";

export function TransactionListOutcome({ notice }: { notice?: string }) {
  const notify = useAdminToast();
  useEffect(() => {
    if (notice !== "deleted") return;
    invalidateTransactionList();
    notify({
      title: "Transaksi dihapus",
      message: "Nomor resmi tidak dipakai ulang. File privat yang terkait masuk antrean pembersihan.",
      tone: "success",
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [notice, notify]);
  return null;
}
