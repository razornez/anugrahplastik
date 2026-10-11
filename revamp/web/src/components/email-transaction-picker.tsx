"use client";

import Image from "next/image";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { linkEmailToTransaction } from "@/features/integrations/actions";
import type { TransactionOption } from "@/features/integrations/transaction-picker-model";

function ProjectPhoto({ item }: { item: TransactionOption }) {
  const [failed, setFailed] = useState(false);
  return item.photoId && !failed ? (
    <Image
      unoptimized
      width={64}
      height={64}
      className="email-transaction-photo"
      src={`/api/admin/transactions/${item.id}/photos/${item.photoId}`}
      alt={`Foto proyek ${item.title}`}
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="email-transaction-photo email-transaction-photo--empty">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="m3 17 5-5 4 4 3-3 6 6" />
        <circle cx="15" cy="8" r="2" />
      </svg>
      <span>Belum ada foto</span>
    </span>
  );
}

function TransactionIdentity({ item }: { item: TransactionOption }) {
  return (
    <>
      <ProjectPhoto item={item} />
      <span className="email-transaction-identity">
        <strong>{item.title}</strong>
        <span>{item.customerName}</span>
        <small>{item.referenceNo}</small>
        <small>
          {item.ownerName ?? "Belum ada penanggung jawab"} ·{" "}
          {new Intl.DateTimeFormat("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "Asia/Jakarta",
          }).format(new Date(item.updatedAt))}{" "}
          WIB
        </small>
      </span>
    </>
  );
}

export function EmailTransactionPicker({ emailId }: { emailId: string }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<TransactionOption[]>([]);
  const [selected, setSelected] = useState<TransactionOption | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [message, submit, pending] = useActionState(
    async (_previous: string | null, form: FormData) => linkEmailToTransaction(form),
    null,
  );

  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id, open]);

  useEffect(() => {
    if (!open || selected) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/transactions/search?${new URLSearchParams({ q: query })}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Pencarian belum berhasil.");
        if (!controller.signal.aborted) {
          setItems(result.items);
          setActive(-1);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setItems([]);
          setError(cause instanceof Error ? cause.message : "Coba lagi.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, selected, retry]);

  function choose(item: TransactionOption) {
    inputRef.current?.focus();
    setSelected(item);
    setQuery(item.title);
    setOpen(false);
    setActive(-1);
  }

  return (
    <form
      action={submit}
      className="email-form email-transaction-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActive(-1);
        }
      }}
      onSubmit={(event) => {
        if (!selected || pending) event.preventDefault();
      }}
    >
      <input type="hidden" name="emailId" value={emailId} />
      <input type="hidden" name="transactionId" value={selected?.id ?? ""} />
      <p>Cari pelanggan atau pekerjaan, pilih transaksi yang sesuai, lalu konfirmasi. Email tidak akan dikirim.</p>
      <label htmlFor={`${id}-input`}>Cari transaksi</label>
      <input
        id={`${id}-input`}
        ref={inputRef}
        role="combobox"
        aria-autocomplete="list"
        autoComplete="off"
        aria-expanded={open && !selected}
        aria-controls={`${id}-results`}
        aria-describedby={`${id}-help`}
        aria-activedescendant={active >= 0 && items[active] ? `${id}-option-${active}` : undefined}
        placeholder="Nama pelanggan, pekerjaan, atau nomor referensi"
        maxLength={120}
        value={query}
        disabled={pending}
        onFocus={() => {
          if (!selected) setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(null);
          setItems([]);
          setActive(-1);
          setLoading(true);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((value) => Math.max(0, Math.min(items.length - 1, value + (event.key === "ArrowDown" ? 1 : -1))));
          }
          if (event.key === "Enter" && !selected) {
            event.preventDefault();
            if (open && items[active]) choose(items[active]);
          }
        }}
      />
      <small id={`${id}-help`}>
        Menampilkan hingga 10 hasil terbaru. Ketik lebih spesifik jika transaksi belum terlihat.
      </small>
      {open && !selected ? (
        <div className="email-transaction-results">
          <p role="status">
            {loading
              ? "Mencari transaksi…"
              : (error ??
                (items.length
                  ? `${items.length} transaksi ditemukan. Pilih salah satu.`
                  : "Tidak ada transaksi yang cocok. Coba nama pelanggan atau kata lain."))}
          </p>
          {error ? (
            <button type="button" className="admin-secondary-button" onClick={() => setRetry((value) => value + 1)}>
              Coba lagi
            </button>
          ) : null}
          <div id={`${id}-results`} role="listbox" aria-label="Hasil pencarian transaksi" aria-busy={loading}>
            {items.map((item, index) => (
              <div
                key={item.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={active === index}
                tabIndex={0}
                className="email-transaction-option"
                onClick={() => choose(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    choose(item);
                  }
                }}
              >
                <TransactionIdentity item={item} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div id={`${id}-results`} role="listbox" aria-label="Hasil pencarian transaksi" hidden />
      )}
      {selected ? (
        <section className="email-transaction-selected" aria-label="Transaksi yang dipilih">
          <p>Transaksi yang akan dikaitkan</p>
          <div>
            <TransactionIdentity item={selected} />
          </div>
          <button
            type="button"
            className="admin-secondary-button"
            disabled={pending}
            onClick={() => {
              setSelected(null);
              setQuery("");
              setItems([]);
              setActive(-1);
              setOpen(true);
              inputRef.current?.focus();
            }}
          >
            Ganti transaksi
          </button>
        </section>
      ) : null}
      {message ? <p role="alert">{message}</p> : null}
      <button className="admin-primary-button" type="submit" disabled={!selected || pending}>
        {pending ? "Mengaitkan…" : "Kaitkan email ke transaksi ini"}
      </button>
    </form>
  );
}
