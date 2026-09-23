"use client";

import { useActionState, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { createTransaction } from "@/features/operations/actions";

type CustomerOption = { id: string; code: string; name: string };

type TransactionCreateFormProps = {
  customerCount: number;
};

const searchDelayMs = 180;

export function TransactionCreateForm({ customerCount }: TransactionCreateFormProps) {
  const router = useRouter();
  const listId = useId();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, formAction, isPending] = useActionState(createTransaction, { status: "idle" });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerOption | null>(null);
  const [options, setOptions] = useState<CustomerOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (state.status === "success" && state.transactionId) {
      router.push(`/admin/transactions/${state.transactionId}`);
    }
  }, [router, state.status, state.transactionId]);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  function loadOptions(nextQuery: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(nextQuery)}`, {
          cache: "no-store",
        });
        const payload: { customers?: CustomerOption[] } = await response.json();
        setOptions(response.ok ? (payload.customers ?? []) : []);
        setActiveIndex(-1);
      } catch {
        setOptions([]);
      } finally {
        setIsSearching(false);
      }
    }, searchDelayMs);
  }

  function choose(customer: CustomerOption) {
    setSelected(customer);
    setQuery(`${customer.code} · ${customer.name}`);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    setSelected(null);
    setIsOpen(true);
    loadOptions(nextQuery);
  }

  function openSearch() {
    setIsOpen(true);
    loadOptions(query);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || !options.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        openSearch();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, options.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(options[activeIndex]);
    }
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <form className="transaction-create" action={formAction} aria-busy={isPending}>
      <label className="transaction-create__customer">
        Customer
        <span className="customer-combobox">
          <input
            aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            autoComplete="off"
            disabled={!customerCount || isPending}
            onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
            onChange={(event) => handleQueryChange(event.target.value)}
            onFocus={openSearch}
            onKeyDown={handleKeyDown}
            placeholder={customerCount ? "Cari nama atau kode customer" : "Belum ada customer"}
            role="combobox"
            type="search"
            value={query}
          />
          <input name="customerId" type="hidden" value={selected?.id ?? ""} />
          {isOpen ? (
            <span className="customer-combobox__results" id={listId} role="listbox">
              {isSearching ? <span className="customer-combobox__hint">Mencari customer…</span> : null}
              {!isSearching && options.length === 0 ? (
                <span className="customer-combobox__hint">Customer tidak ditemukan.</span>
              ) : null}
              {!isSearching
                ? options.map((customer, index) => (
                    <button
                      aria-selected={selected?.id === customer.id}
                      className={activeIndex === index ? "is-active" : undefined}
                      id={`${listId}-${index}`}
                      key={customer.id}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(customer);
                      }}
                      role="option"
                      type="button"
                    >
                      <strong>{customer.name}</strong>
                      <small>{customer.code}</small>
                    </button>
                  ))
                : null}
            </span>
          ) : null}
        </span>
      </label>
      <label>
        Judul pekerjaan
        <input
          disabled={!customerCount || isPending}
          name="title"
          placeholder="Contoh: Reproduksi cover gear"
          required
        />
      </label>
      <button disabled={!customerCount || isPending} type="submit">
        {isPending ? "Menyimpan…" : "Buat transaksi"}
      </button>
      {state.status !== "idle" ? (
        <p aria-live="polite" className={`transaction-create__message transaction-create__message--${state.status}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
