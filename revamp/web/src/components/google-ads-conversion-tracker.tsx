"use client";

import { useEffect } from "react";
import { analyticsConsent } from "./analytics-consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

type LeadConversionDetail = { conversionId: string };

function installTag(tagId: string) {
  if (document.querySelector(`script[data-google-ads-tag="${tagId}"]`)) return;
  window.dataLayer = window.dataLayer ?? [];
  // gtag.js expects the standard Arguments objects, not rest-parameter arrays.
  window.gtag =
    window.gtag ??
    function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };
  window.gtag("js", new Date());
  window.gtag("config", tagId);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`;
  script.dataset.googleAdsTag = tagId;
  script.onerror = () => script.remove();
  document.head.append(script);
}

export function GoogleAdsConversionTracker({ tagId, leadLabel }: { tagId?: string; leadLabel?: string }) {
  useEffect(() => {
    if (!tagId || !leadLabel || !/^AW-\d{6,15}$/.test(tagId) || !/^[A-Za-z0-9_-]{8,128}$/.test(leadLabel)) return;

    const enable = () => {
      if (analyticsConsent()) installTag(tagId);
    };
    const onLeadCreated = (event: Event) => {
      if (!analyticsConsent()) return;
      enable();
      const detail = (event as CustomEvent<LeadConversionDetail>).detail;
      if (!detail?.conversionId) return;
      const key = `ap-google-ads-lead-${detail.conversionId}`;
      try {
        if (window.sessionStorage.getItem(key)) return;
      } catch {
        // Private browsing can disable sessionStorage; it must not block a saved lead.
      }
      if (!window.gtag) return;
      window.gtag("event", "conversion", {
        send_to: `${tagId}/${leadLabel}`,
        value: 1,
        currency: "IDR",
        transaction_id: detail.conversionId,
      });
      try {
        window.sessionStorage.setItem(key, "1");
      } catch {
        // Google's transaction_id still protects the account from duplicate counts.
      }
    };

    enable();
    window.addEventListener("online", enable);
    window.addEventListener("ap:analytics-preference", enable);
    window.addEventListener("ap:google-ads-lead", onLeadCreated);
    return () => {
      window.removeEventListener("online", enable);
      window.removeEventListener("ap:analytics-preference", enable);
      window.removeEventListener("ap:google-ads-lead", onLeadCreated);
    };
  }, [leadLabel, tagId]);

  return null;
}
