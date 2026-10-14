"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
    if (!hydrated) return;
    const current = JSON.stringify(value);
    const timeout = window.setTimeout(() => {
      if (current === initialJson) window.localStorage.removeItem(storageKey);
      else {
        const envelope: TransactionDraftEnvelope<T> = { version: 1, updatedAt: new Date().toISOString(), value };
        window.localStorage.setItem(storageKey, JSON.stringify(envelope));
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [hydrated, initialJson, storageKey, value]);

  function discard() {
    window.localStorage.removeItem(storageKey);
    restore(initial);
    setRestored(false);
  }

  return { restored, discard };
}
