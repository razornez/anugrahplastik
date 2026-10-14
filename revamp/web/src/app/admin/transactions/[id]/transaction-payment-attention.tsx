"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "../transactions.module.css";

export function TransactionPaymentAttention({
  difference,
  received,
  issued,
  href,
}: {
  difference: string;
  received: string;
  issued: string;
  href: string;
}) {
  const inlineRef = useRef<HTMLElement>(null);
  const [outOfView, setOutOfView] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const inline = inlineRef.current;
    if (!inline || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOutOfView(!entry.isIntersecting));
    observer.observe(inline);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const hideForFocusedAction = () => {
      if (["#transaction-payment-review", "#production-target"].includes(window.location.hash)) {
        setDismissed(true);
      }
    };
    hideForFocusedAction();
    window.addEventListener("hashchange", hideForFocusedAction);
    return () => window.removeEventListener("hashchange", hideForFocusedAction);
  }, []);

  return (
    <>
      <section className={styles.paymentAttention} ref={inlineRef}>
        <span aria-hidden="true" className={styles.paymentAttentionIcon}>
          <svg fill="none" viewBox="0 0 24 24">
            <path d="M12 7v6m0 4h.01M4.93 19h14.14a2 2 0 0 0 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.2 16a2 2 0 0 0 1.73 3Z" />
          </svg>
        </span>
        <div className={styles.paymentAttentionCopy}>
          <h2>Selisih pembayaran {difference} belum cocok dengan invoice</h2>
          <p>
            Pembayaran terverifikasi {received}, sedangkan invoice terbit {issued}. Cocokkan bukti transfer dan invoice.
            Jika nominal salah, minta Admin koreksi sebelum menutup transaksi.
          </p>
        </div>
        <Link className={styles.paymentAttentionLink} href={href}>
          Periksa invoice &amp; bukti <span aria-hidden="true">→</span>
        </Link>
      </section>
      {outOfView && !dismissed ? (
        <aside aria-label="Pengingat selisih pembayaran" className={styles.paymentAttentionFloating} role="status">
          <div>
            <strong>Selisih pembayaran {difference}</strong>
            <p>Invoice dan bukti transfer perlu dicocokkan sebelum transaksi ditutup.</p>
            <Link href={href} onClick={() => setDismissed(true)}>
              Periksa invoice &amp; bukti →
            </Link>
          </div>
          <button aria-label="Tutup pengingat pembayaran" onClick={() => setDismissed(true)} type="button">
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </aside>
      ) : null}
    </>
  );
}
