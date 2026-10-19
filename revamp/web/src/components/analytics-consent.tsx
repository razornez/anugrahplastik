"use client";

const optOutKey = "ap-analytics-opt-out-v1";

export function analyticsConsent() {
  return window.localStorage.getItem(optOutKey) !== "true";
}

export function setAnalyticsOptOut(value: boolean) {
  window.localStorage.setItem(optOutKey, String(value));
  if (value) {
    window.sessionStorage.removeItem("ap-analytics-entry-v1");
    window.sessionStorage.removeItem("ap-analytics-session-id-v1");
    window.sessionStorage.removeItem("ap-analytics-session-active-v1");
    window.localStorage.removeItem("ap-analytics-anonymous-id-v1");
  }
  window.dispatchEvent(new CustomEvent("ap:analytics-preference", { detail: value }));
}
