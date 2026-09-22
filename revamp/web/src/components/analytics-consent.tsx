"use client";

import { useSyncExternalStore } from "react";

const consentKey = "ap-analytics-consent-v1";

type Consent = "granted" | "denied" | null;

function storedConsent(): Consent {
  const value = window.localStorage.getItem(consentKey);
  return value === "granted" || value === "denied" ? value : null;
}

export function analyticsConsent() {
  return storedConsent() === "granted";
}

function subscribe(listener: () => void) {
  window.addEventListener("ap:analytics-consent", listener);
  return () => window.removeEventListener("ap:analytics-consent", listener);
}

export function AnalyticsConsent() {
  const consent = useSyncExternalStore(subscribe, storedConsent, () => null);

  const choose = (value: Exclude<Consent, null>) => {
    window.localStorage.setItem(consentKey, value);
    window.dispatchEvent(new CustomEvent("ap:analytics-consent", { detail: value }));
  };

  if (consent !== null) return null;

  return (
    <aside className="analytics-consent" aria-label="Pilihan analitik">
      <p>
        Dengan izin Anda, kami mencatat penggunaan website secara anonim—perangkat, lokasi kota kasar, klik, scroll, dan
        bagian terakhir yang dilihat—untuk memperbaiki informasi di halaman. Isi formulir, nomor WhatsApp, dan IP tidak
        direkam dalam analitik.
      </p>
      <a href="/privasi">Pelajari cara kami menggunakan data</a>
      <div>
        <button type="button" onClick={() => choose("denied")}>
          Tolak
        </button>
        <button type="button" onClick={() => choose("granted")}>
          Izinkan analitik
        </button>
      </div>
    </aside>
  );
}
