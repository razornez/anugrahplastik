"use client";

const optOutKey = "ap-analytics-opt-out-v1";

export function analyticsConsent() {
  return window.localStorage.getItem(optOutKey) !== "true";
}

export function setAnalyticsOptOut(value: boolean) {
  window.localStorage.setItem(optOutKey, String(value));
  window.dispatchEvent(new CustomEvent("ap:analytics-preference", { detail: value }));
}
