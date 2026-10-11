"use client";

import { useState } from "react";
import { analyticsConsent, setAnalyticsOptOut } from "./analytics-consent";

export function AnalyticsPreferenceControl() {
  const [enabled, setEnabled] = useState(() => (typeof window === "undefined" ? true : analyticsConsent()));

  const change = (value: boolean) => {
    setAnalyticsOptOut(!value);
    setEnabled(value);
  };

  return (
    <div className="privacy-choice">
      <p>
        Analitik penggunaan website saat ini <strong>{enabled ? "aktif" : "tidak aktif"}</strong> di perangkat ini.
      </p>
      <button type="button" onClick={() => change(!enabled)}>
        {enabled ? "Nonaktifkan analitik" : "Aktifkan analitik"}
      </button>
    </div>
  );
}
