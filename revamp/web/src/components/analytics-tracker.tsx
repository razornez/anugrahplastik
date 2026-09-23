"use client";

import { useEffect } from "react";
import { analyticsConsent } from "./analytics-consent";
import type { AnalyticsBatch, AnalyticsEvent, AnalyticsEventName } from "@/features/analytics/schema";

const anonymousKey = "ap-analytics-anonymous-id-v1";
const scrollMilestones = [25, 50, 75, 90] as const;

type TrackDetail = Omit<AnalyticsEvent, "path" | "occurredAt">;

function anonymousId() {
  const existing = window.localStorage.getItem(anonymousKey);
  if (existing) return existing;

  const created = crypto.randomUUID();
  window.localStorage.setItem(anonymousKey, created);
  return created;
}

function currentPath() {
  return window.location.pathname;
}

function sendBatch(events: AnalyticsEvent[], useBeacon = false) {
  if (!analyticsConsent() || events.length === 0) return;
  const payload: AnalyticsBatch = { anonymousId: anonymousId(), events, consentVersion: "v1" };
  const body = JSON.stringify(payload);

  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics/events", new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}

function describeClick(
  target: Element,
  root: HTMLElement,
): Pick<AnalyticsEvent, "name" | "sectionKey" | "elementKey"> | null {
  const sectionKey = target.closest("section[id]")?.id;
  const nav = target.closest<HTMLElement>("[data-nav]");
  if (nav) return { name: "menu_click", sectionKey, elementKey: nav.dataset.nav ?? "menu" };

  const whatsapp = target.closest<HTMLElement>("[data-wa]");
  if (whatsapp) return { name: "whatsapp_click", sectionKey, elementKey: whatsapp.className || "whatsapp" };

  const faq = target.closest<HTMLElement>(".ap-faq-q");
  if (faq) {
    const index = Array.from(root.querySelectorAll(".ap-faq-q")).indexOf(faq);
    return { name: "faq_open", sectionKey, elementKey: `faq-${index + 1}` };
  }

  const portfolio = target.closest<HTMLElement>(".ap-pcard");
  if (portfolio) {
    const index = Array.from(root.querySelectorAll(".ap-pcard")).indexOf(portfolio);
    return { name: "portfolio_open", sectionKey, elementKey: `portfolio-${index + 1}` };
  }

  const cta = target.closest<HTMLElement>(".ap-btn-wa, .ap-btn-ghost, .ap-filter, button");
  if (cta) return { name: "cta_click", sectionKey, elementKey: cta.className || "button" };

  return null;
}

export function AnalyticsTracker() {
  useEffect(() => {
    let dispose = () => undefined;

    const start = () => {
      const root = document.getElementById("ap-root");
      if (!root) return;

      let formStarted = false;
      let formSubmitted = false;
      let activeSection: string | undefined;
      const observedSections = new Set<string>();
      const sectionTimers = new Map<string, number>();
      const reachedMilestones = new Set<number>();
      const queue: AnalyticsEvent[] = [];
      const flush = (useBeacon = false) => {
        const outgoing = queue.splice(0, 25);
        sendBatch(outgoing, useBeacon);
      };
      const track = (name: AnalyticsEventName, detail: Partial<TrackDetail> = {}, useBeacon = false) => {
        queue.push({ name, path: currentPath(), ...detail, occurredAt: new Date().toISOString() });
        if (useBeacon || queue.length >= 10) flush(useBeacon);
      };

      track("page_view");

      const sectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const sectionKey = (entry.target as HTMLElement).id;
            if (!sectionKey) return;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              activeSection = sectionKey;
            }
            if (observedSections.has(sectionKey)) return;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              sectionTimers.set(
                sectionKey,
                window.setTimeout(() => {
                  observedSections.add(sectionKey);
                  track("section_engaged", { sectionKey, metadata: { active_seconds: 8 } });
                }, 8_000),
              );
            } else {
              const timer = sectionTimers.get(sectionKey);
              if (timer) window.clearTimeout(timer);
              sectionTimers.delete(sectionKey);
            }
          });
        },
        { threshold: [0.5] },
      );
      root.querySelectorAll("section[id]").forEach((section) => sectionObserver.observe(section));

      const onScroll = () => {
        const maximum = document.documentElement.scrollHeight - window.innerHeight;
        if (maximum <= 0) return;
        const depth = Math.round((window.scrollY / maximum) * 100);
        scrollMilestones.forEach((milestone) => {
          if (depth < milestone || reachedMilestones.has(milestone)) return;
          reachedMilestones.add(milestone);
          track("scroll_depth", { metadata: { percent: milestone } });
        });
      };

      const onClick = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const detail = describeClick(target, root);
        if (detail) track(detail.name, detail);
      };

      const onFormFocus = (event: FocusEvent) => {
        const target = event.target;
        if (formStarted || !(target instanceof HTMLElement) || !target.closest("#ap-form")) return;
        formStarted = true;
        track("form_start", { sectionKey: "ap-contact", elementKey: "request-form" });
      };

      const onCustomTrack = (event: Event) => {
        const detail = (event as CustomEvent<TrackDetail>).detail;
        if (!detail) return;
        if (detail.name === "form_submit") formSubmitted = true;
        track(detail.name, detail);
      };

      const onPageHide = () => {
        if (formStarted && !formSubmitted) {
          track("form_abandon", { sectionKey: "ap-contact", elementKey: "request-form" }, true);
        }
        track("page_leave", { sectionKey: activeSection }, true);
        flush(true);
      };

      const interval = window.setInterval(() => flush(), 5_000);

      window.addEventListener("scroll", onScroll, { passive: true });
      root.addEventListener("click", onClick);
      root.addEventListener("focusin", onFormFocus);
      window.addEventListener("ap:analytics-track", onCustomTrack);
      window.addEventListener("pagehide", onPageHide);
      onScroll();

      dispose = () => {
        window.removeEventListener("scroll", onScroll);
        root.removeEventListener("click", onClick);
        root.removeEventListener("focusin", onFormFocus);
        window.removeEventListener("ap:analytics-track", onCustomTrack);
        window.removeEventListener("pagehide", onPageHide);
        sectionTimers.forEach((timer) => window.clearTimeout(timer));
        sectionObserver.disconnect();
        window.clearInterval(interval);
        flush();
      };
    };

    const onConsent = () => {
      dispose();
      start();
    };
    start();
    window.addEventListener("ap:analytics-preference", onConsent);
    return () => {
      window.removeEventListener("ap:analytics-preference", onConsent);
      dispose();
    };
  }, []);

  return null;
}
