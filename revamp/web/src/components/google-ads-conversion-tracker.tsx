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
  window.gtag = window.gtag ?? ((...args: unknown[]) => window.dataLayer?.push(args));
  window.gtag("js", new Date());
  window.gtag("config", tagId);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`;
  script.dataset.googleAdsTag = tagId;
  document.head.append(script);
}

export function GoogleAdsConversionTracker({ tagId, leadLabel }: { tagId?: string; leadLabel?: string }) {
  useEffect(() => {
    if (!tagId || !leadLabel) return;

    const enable = () => {
      if (analyticsConsent()) installTag(tagId);
    };
    const onLeadCreated = (event: Event) => {
      if (!analyticsConsent()) return;
      enable();
      const detail = (event as CustomEvent<LeadConversionDetail>).detail;
      if (!detail?.conversionId) return;
      const key = `ap-google-ads-lead-${detail.conversionId}`;
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
      window.gtag?.("event", "conversion", { send_to: `${tagId}/${leadLabel}`, transaction_id: detail.conversionId });
    };

    enable();
    window.addEventListener("ap:analytics-preference", enable);
    window.addEventListener("ap:google-ads-lead", onLeadCreated);
    return () => {
      window.removeEventListener("ap:analytics-preference", enable);
      window.removeEventListener("ap:google-ads-lead", onLeadCreated);
    };
  }, [leadLabel, tagId]);

  return null;
}
