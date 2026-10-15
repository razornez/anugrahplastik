"use client";

import { useEffect, useState } from "react";
import { useAdminToast } from "@/components/admin-ui";
import { invalidateTransactionList, markTransactionDraftDirty } from "@/components/transaction-session-state";

const scrollKey = "ap:transaction-action-scroll-v1";

export function TransactionActionFeedback({
  transactionId,
  userId,
  step,
  notice,
  message,
}: {
  transactionId: string;
  userId: string;
  step: string;
  notice?: string;
  message?: string;
}) {
  const notify = useAdminToast();
  const [restored, setRestored] = useState(false);
  const draftPrefix = `ap:transaction-form:v1:${userId}:${transactionId}:${step}:`;

  useEffect(() => {
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>(".transaction-flow-page form"));
    const restoreForm = (form: HTMLFormElement, index: number) => {
      if (notice && message && !/(?:check|invalid|unavailable|not-ready|pending-review)/.test(notice)) return;
      if (form.dataset.controlledDraft) return;
      try {
        const raw = localStorage.getItem(`${draftPrefix}${index}`);
        if (!raw) return;
        const stored = JSON.parse(raw) as Array<{ index: number; value: string; checked?: boolean }>;
        const controls = Array.from(
          form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"),
        ).filter(
          (control) =>
            (control.name || control.hasAttribute("data-draft-money")) &&
            control.type !== "hidden" &&
            control.type !== "file",
        );
        stored.forEach((item) => {
          const control = controls[item.index];
          if (!control) return;
          if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
            control.checked = Boolean(item.checked);
            control.dispatchEvent(new Event("change", { bubbles: true }));
          } else if (control instanceof HTMLInputElement) {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(control, item.value);
            control.dispatchEvent(new CustomEvent("ap:restore-draft", { detail: item.value }));
            control.dispatchEvent(new Event("input", { bubbles: true }));
          } else if (control instanceof HTMLTextAreaElement) {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(control, item.value);
            control.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            control.value = item.value;
            control.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
        markTransactionDraftDirty(`${draftPrefix}${index}`, true);
        setRestored(true);
      } catch {
        /* Invalid browser draft is ignored. */
      }
    };
    forms.forEach(restoreForm);
    const save = (event: Event) => {
      const control = event.target;
      if (!(control instanceof HTMLElement)) return;
      const form = control.closest<HTMLFormElement>(".transaction-flow-page form");
      if (!form || form.dataset.controlledDraft) return;
      const index = forms.indexOf(form);
      if (index < 0) return;
      const controls = Array.from(
        form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"),
      ).filter(
        (item) =>
          (item.name || item.hasAttribute("data-draft-money")) && item.type !== "hidden" && item.type !== "file",
      );
      const fields = controls.map((item, position) => ({
        index: position,
        value: item.value,
        checked: item instanceof HTMLInputElement ? item.checked : undefined,
      }));
      try {
        localStorage.setItem(`${draftPrefix}${index}`, JSON.stringify(fields));
      } catch {
        /* Editing still works without storage. */
      }
      markTransactionDraftDirty(`${draftPrefix}${index}`, true);
    };
    document.addEventListener("input", save, true);
    document.addEventListener("change", save, true);
    return () => {
      document.removeEventListener("input", save, true);
      document.removeEventListener("change", save, true);
      forms.forEach((_, index) => markTransactionDraftDirty(`${draftPrefix}${index}`, false));
    };
  }, [draftPrefix, message, notice]);

  useEffect(() => {
    const capture = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.closest(".transaction-flow-page")) return;
      if (form.method.toLowerCase() === "get") return;
      try {
        sessionStorage.setItem(scrollKey, JSON.stringify({ transactionId, y: window.scrollY, at: Date.now() }));
      } catch {
        // Submitting must continue when browser storage is unavailable.
      }
    };
    document.addEventListener("submit", capture, true);
    return () => document.removeEventListener("submit", capture, true);
  }, [transactionId]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(scrollKey);
      if (raw) {
        sessionStorage.removeItem(scrollKey);
        const saved = JSON.parse(raw) as { transactionId?: string; y?: number; at?: number };
        if (
          saved.transactionId === transactionId &&
          typeof saved.y === "number" &&
          Date.now() - (saved.at ?? 0) < 90_000
        ) {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => window.scrollTo({ top: saved.y!, behavior: "instant" })),
          );
        }
      }
    } catch {
      // Scroll restoration is a convenience, never a navigation dependency.
    }
  }, [transactionId]);

  useEffect(() => {
    if (!notice || !message) return;
    const failed = /(?:check|invalid|unavailable|not-ready|pending-review)/.test(notice);
    if (!failed) {
      invalidateTransactionList();
      for (let index = 0; index < 100; index++) {
        localStorage.removeItem(`${draftPrefix}${index}`);
        markTransactionDraftDirty(`${draftPrefix}${index}`, false);
      }
    }
    notify({
      title: failed ? "Tindakan belum berhasil" : "Perubahan tersimpan",
      message,
      tone: failed ? "error" : "success",
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [draftPrefix, message, notice, notify]);

  return restored ? (
    <div className="transaction-draft-restored" role="status">
      Draft form belum disimpan dipulihkan.
      <button
        onClick={() => {
          for (let index = 0; index < 100; index++) {
            localStorage.removeItem(`${draftPrefix}${index}`);
            markTransactionDraftDirty(`${draftPrefix}${index}`, false);
          }
          setRestored(false);
          window.location.reload();
        }}
        type="button"
      >
        Buang draft
      </button>
    </div>
  ) : null;
}
