"use client";

import { useState, type ReactNode } from "react";
import styles from "./business-discovery.module.css";

export function GrowthRadarWorkspace({
  business,
  marketing,
  initialTab = "business",
}: {
  business?: ReactNode;
  marketing: ReactNode;
  initialTab?: "business" | "marketing";
}) {
  const [tab, setTab] = useState(business ? initialTab : "marketing");
  function select(next: "business" | "marketing") {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("radar", next);
    window.history.replaceState(null, "", url);
  }
  return (
    <section id="peluang" className={styles.workspace} aria-labelledby="radar-title">
      <header className={styles.heading}>
        <div>
          <p className="eyebrow">Temukan · tinjau · tindak lanjuti</p>
          <h2 id="radar-title">Radar peluang</h2>
          <p>Temukan perusahaan yang bisa didekati, atau pelajari temuan pemasaran. Semuanya tersedia di sini.</p>
        </div>
        {business ? (
          <div className={styles.tabs} aria-label="Bagian Radar Peluang" role="tablist">
            <button
              id="radar-business-tab"
              type="button"
              role="tab"
              aria-selected={tab === "business"}
              aria-controls="radar-business"
              tabIndex={tab === "business" ? 0 : -1}
              onClick={() => select("business")}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  select("marketing");
                  document.getElementById("radar-marketing-tab")?.focus();
                }
              }}
            >
              Calon pelanggan
            </button>
            <button
              id="radar-marketing-tab"
              type="button"
              role="tab"
              aria-selected={tab === "marketing"}
              aria-controls="radar-marketing"
              tabIndex={tab === "marketing" ? 0 : -1}
              onClick={() => select("marketing")}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  select("business");
                  document.getElementById("radar-business-tab")?.focus();
                }
              }}
            >
              Temuan pemasaran
            </button>
          </div>
        ) : null}
      </header>
      {business ? (
        <div role="tabpanel" id="radar-business" aria-labelledby="radar-business-tab" hidden={tab !== "business"}>
          {business}
        </div>
      ) : null}
      <div
        role={business ? "tabpanel" : undefined}
        id="radar-marketing"
        aria-labelledby={business ? "radar-marketing-tab" : undefined}
        hidden={tab !== "marketing"}
        className={styles.marketing}
      >
        {marketing}
      </div>
    </section>
  );
}
