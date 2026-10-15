"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  captureTransactionList,
  getCachedTransactionList,
  scopeTransactionSession,
} from "@/components/transaction-session-state";

type Row = { id: string; title: string; referenceNo: string; customerName: string; stage: string; payment: string };

export function TransactionListCacheScope({ userId }: { userId: string | null }) {
  useEffect(() => scopeTransactionSession(userId), [userId]);
  return null;
}

export function TransactionListCacheCapture({ userId, rows }: { userId: string; rows: Row[] }) {
  useEffect(() => {
    scopeTransactionSession(userId);
    captureTransactionList(rows);
  }, [rows, userId]);
  return null;
}

export function TransactionListLoading() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setRows(getCachedTransactionList()?.rows ?? null));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <section className="transaction-list-loading" aria-busy="true" aria-live="polite">
      <h1>Transaksi</h1>
      <p>Memperbarui daftar transaksi…</p>
      {rows ? (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/admin/transactions/${row.id}`}>{row.title}</Link>
              <span>
                {row.customerName} · {row.referenceNo} · {row.stage}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="transaction-list-loading__skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      )}
    </section>
  );
}
