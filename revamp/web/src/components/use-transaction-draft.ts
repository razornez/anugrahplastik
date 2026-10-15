"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { markTransactionDraftDirty } from "@/components/transaction-session-state";

export type TransactionDraftEnvelope<T> = {
  version: 1;
  updatedAt: string;
  value: T;
};

export function useTransactionDraft<T>({
  key,
  value,
  initial,
  restore,
}: {
  key: string;
  value: T;
  initial: T;
  restore: (value: T) => void;
}) {
  const storageKey = useMemo(() => "transaction-draft:v1:" + key, [key]);
  const initialJson = useMemo(() => JSON.stringify(initial), [initial]);
  const restoreRef = useRef(restore);
  const clearedAfterSave = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    restoreRef.current = restore;
  }, [restore]);

  useEffect(() => {
    let cancelled = false;
    let draft: T | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const envelope = JSON.parse(raw) as TransactionDraftEnvelope<T>;
        if (envelope.version === 1) {
          if (JSON.stringify(envelope.value) === initialJson) window.localStorage.removeItem(storageKey);
          else draft = envelope.value;
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
    queueMicrotask(() => {
      if (cancelled) return;
      if (draft) {
        restoreRef.current(draft);
        setRestored(true);
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initialJson, storageKey]);

  useEffect(() => {
    if (!hydrated || clearedAfterSave.current) return;
    const current = JSON.stringify(value);
    markTransactionDraftDirty(storageKey, current !== initialJson);
    try {
      if (current === initialJson) window.localStorage.removeItem(storageKey);
      else {
        const envelope: TransactionDraftEnvelope<T> = { version: 1, updatedAt: new Date().toISOString(), value };
        window.localStorage.setItem(storageKey, JSON.stringify(envelope));
      }
    } catch {
      /* Input remains editable without browser storage. */
    }
  }, [hydrated, initialJson, storageKey, value]);

  useEffect(() => () => markTransactionDraftDirty(storageKey, false), [storageKey]);

  const discard = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    restoreRef.current(initial);
    setRestored(false);
    markTransactionDraftDirty(storageKey, false);
  }, [initial, storageKey]);

  const clear = useCallback(() => {
    clearedAfterSave.current = true;
    window.localStorage.removeItem(storageKey);
    markTransactionDraftDirty(storageKey, false);
    setRestored(false);
  }, [storageKey]);

  return { restored, discard, clear };
}
