"use client";

import { useLayoutEffect } from "react";
import { campaignAttribution, type AnalyticsEntry } from "@/features/analytics/entry";
import { analyticsConsent } from "./analytics-consent";
import { leadFormSchema } from "@/features/leads/schema";

const whatsappNumber = "628122339587";

function whatsappUrl(message: string) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export function LandingInteractions() {
  useLayoutEffect(() => {
    const root = document.getElementById("ap-root");
    if (!root) return;

    // The page markup is inserted by React; native hash navigation can run before it exists.
    if (window.location.hash === "#ap-contact") {
      const previous = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      document.getElementById("ap-contact")?.scrollIntoView({ behavior: "auto" });
      document.documentElement.style.scrollBehavior = previous;
    }

    const waMessage = "Halo Anugrah Plastik, saya ingin bertanya atau meminta penawaran cetak plastik custom.";
    root.querySelectorAll<HTMLAnchorElement>("[data-wa]").forEach((link) => {
      link.href = whatsappUrl(waMessage);
    });

    const header = document.getElementById("ap-header");
    const updateHeader = () => {
      if (header) header.style.boxShadow = window.scrollY > 10 ? "0 8px 26px -16px rgba(8,32,59,.4)" : "none";
    };
    window.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();

    const navLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>("[data-nav]"));
    const sections = navLinks
      .map((link) => document.getElementById(link.dataset.nav ?? ""))
      .filter((section): section is HTMLElement => Boolean(section));
    const navigationObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (!visible) return;
        navLinks.forEach((link) => {
          link.style.color = link.dataset.nav === visible.target.id ? "#1457C7" : "#5C6B7E";
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((section) => navigationObserver.observe(section));

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const trustSection = root.querySelector<HTMLElement>("#ap-trust");
    const marqueeToggle = trustSection?.querySelector<HTMLButtonElement>(".ap-marquee-toggle");
    const toggleMarquee = () => {
      if (!trustSection || !marqueeToggle) return;
      const paused = trustSection.dataset.paused !== "true";
      trustSection.dataset.paused = String(paused);
      marqueeToggle.setAttribute("aria-pressed", String(paused));
      marqueeToggle.textContent = paused ? "Lanjutkan animasi logo" : "Jeda animasi logo";
    };
    marqueeToggle?.addEventListener("click", toggleMarquee);
    const revealItems = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    let revealObserver: IntersectionObserver | null = null;
    if (!reducedMotion) {
      revealItems.forEach((item) => {
        item.style.opacity = "0";
        item.style.transform = "translateY(26px)";
        item.style.transition = "opacity .65s ease, transform .65s ease";
      });
      revealObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const item = entry.target as HTMLElement;
            item.style.opacity = "1";
            item.style.transform = "translateY(0)";
            observer.unobserve(item);
          });
        },
        { threshold: 0.12 },
      );
      revealItems.forEach((item) => revealObserver?.observe(item));
    }

    const burger = document.getElementById("ap-burger");
    const mobile = document.getElementById("ap-mobile");
    const setMenuOpen = (open: boolean) => {
      if (mobile) mobile.hidden = !open;
      burger?.setAttribute("aria-expanded", String(open));
    };
    const updateBurger = () => {
      const compact = window.innerWidth <= 900;
      if (burger) burger.style.display = compact ? "flex" : "none";
      if (!compact) setMenuOpen(false);
    };
    const toggleMenu = () => {
      setMenuOpen(burger?.getAttribute("aria-expanded") !== "true");
    };
    const mobileLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>("#ap-mobile .ap-mlink"));
    const closeMenu = () => setMenuOpen(false);
    burger?.addEventListener("click", toggleMenu);
    mobileLinks.forEach((link) => link.addEventListener("click", closeMenu));
    window.addEventListener("resize", updateBurger);
    updateBurger();

    const filters = Array.from(root.querySelectorAll<HTMLElement>(".ap-filter"));
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".ap-pcard"));
    const filterHandlers = filters.map((button) => {
      const handler = () => {
        const filter = button.dataset.filter;
        filters.forEach((candidate) => {
          const active = candidate === button;
          candidate.style.background = active ? "#1457C7" : "#fff";
          candidate.style.color = active ? "#fff" : "#46566A";
          candidate.style.borderColor = active ? "#1457C7" : "#D9E2EE";
        });
        cards.forEach((card) => {
          card.style.display = filter === "all" || card.dataset.cat === filter ? "" : "none";
        });
      };
      button.addEventListener("click", handler);
      return { button, handler };
    });

    const lightbox = document.getElementById("ap-lightbox");
    const lightboxImage = document.getElementById("ap-lightbox-img") as HTMLImageElement | null;
    const lightboxCaption = document.getElementById("ap-lightbox-cap");
    const cardHandlers = cards.map((card) => {
      const handler = () => {
        if (!lightbox || !lightboxImage || !lightboxCaption) return;
        lightboxImage.src = card.dataset.src ?? "";
        lightboxImage.alt = card.dataset.caption ?? "";
        lightboxCaption.textContent = card.dataset.caption ?? "";
        lightbox.style.display = "flex";
        document.body.style.overflow = "hidden";
      };
      card.addEventListener("click", handler);
      return { card, handler };
    });
    const closeLightbox = () => {
      if (lightbox) lightbox.style.display = "none";
      document.body.style.overflow = "";
    };
    lightbox?.addEventListener("click", closeLightbox);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeLightbox();
      if (burger?.getAttribute("aria-expanded") === "true") {
        closeMenu();
        burger.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);

    const faqItems = Array.from(root.querySelectorAll<HTMLElement>(".ap-faq-item"));
    const closeFaqItem = (item: HTMLElement) => {
      const question = item.querySelector<HTMLElement>(".ap-faq-q");
      const answer = item.querySelector<HTMLElement>(".ap-faq-a");
      const icon = item.querySelector<HTMLElement>(".ap-faq-ic");
      if (!question || !answer || !icon) return;
      question.setAttribute("aria-expanded", "false");
      answer.setAttribute("aria-hidden", "true");
      answer.style.maxHeight = "0px";
      icon.style.transform = "none";
      icon.style.background = "#EAF1FD";
      icon.style.color = "#1457C7";
      icon.textContent = "+";
    };
    const faqHandlers = faqItems.flatMap((item, index) => {
      const question = item.querySelector<HTMLElement>(".ap-faq-q");
      const answer = item.querySelector<HTMLElement>(".ap-faq-a");
      const icon = item.querySelector<HTMLElement>(".ap-faq-ic");
      if (!question || !answer || !icon) return [];
      const answerId = `ap-faq-answer-${index + 1}`;
      answer.id = answerId;
      question.setAttribute("aria-controls", answerId);
      closeFaqItem(item);
      const handler = () => {
        const opening = question.getAttribute("aria-expanded") !== "true";
        faqItems.forEach(closeFaqItem);
        if (opening) {
          answer.style.maxHeight = `${answer.scrollHeight + 40}px`;
          answer.setAttribute("aria-hidden", "false");
          question.setAttribute("aria-expanded", "true");
          icon.style.transform = "rotate(45deg)";
          icon.style.background = "#1457C7";
          icon.style.color = "#fff";
        }
      };
      question.addEventListener("click", handler);
      return [{ question, handler }];
    });

    const form = document.getElementById("ap-form") as HTMLFormElement | null;
    if (form) form.noValidate = true;
    const fieldIds = { name: "ap-lead-name", phone: "ap-lead-phone", message: "ap-lead-message" } as const;
    type FieldName = keyof typeof fieldIds;
    const summary = form?.querySelector<HTMLElement>("[data-form-summary]");
    const whatsappLink = form?.querySelector<HTMLAnchorElement>("[data-form-whatsapp]");
    const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    const status = form?.querySelector<HTMLElement>("[data-form-status]");
    const editableFields = Array.from(
      form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select") ??
        [],
    );
    const buttonLabel = submit?.textContent?.trim() ?? "Simpan dan lanjut ke WhatsApp";
    let submitting = false;

    const trackForm = (name: "form_submit_attempt" | "form_error", field?: FieldName) => {
      window.dispatchEvent(
        new CustomEvent("ap:analytics-track", {
          detail: {
            name,
            sectionKey: "ap-contact",
            elementKey: "request-form",
            ...(field ? { metadata: { field } } : {}),
          },
        }),
      );
    };
    const showErrors = (errors: Partial<Record<FieldName, string>>) => {
      const entries = Object.entries(errors) as Array<[FieldName, string]>;
      for (const field of Object.keys(fieldIds) as FieldName[]) {
        const input = document.getElementById(fieldIds[field]);
        const error = form?.querySelector<HTMLElement>(`[data-error-for="${field}"]`);
        if (input) input.setAttribute("aria-invalid", errors[field] ? "true" : "false");
        if (error) {
          error.textContent = errors[field] ?? "";
          error.hidden = !errors[field];
        }
      }
      if (!summary) return;
      summary.replaceChildren();
      summary.hidden = entries.length === 0;
      if (!entries.length) return;
      const heading = document.createElement("strong");
      heading.textContent = "Periksa isian berikut:";
      summary.append(heading);
      const list = document.createElement("ul");
      list.style.margin = "6px 0 0";
      list.style.paddingLeft = "20px";
      for (const [field, message] of entries) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = `#${fieldIds[field]}`;
        link.textContent = message;
        item.append(link);
        list.append(item);
        trackForm("form_error", field);
      }
      summary.append(list);
      summary.focus();
    };
    const onFormInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !form) return;
      const field = (Object.keys(fieldIds) as FieldName[]).find((key) => fieldIds[key] === target.id);
      if (field) {
        target.setAttribute("aria-invalid", "false");
        const error = form.querySelector<HTMLElement>(`[data-error-for="${field}"]`);
        if (error) error.hidden = true;
      }
      if (summary) summary.hidden = true;
      if (form.dataset.submitted === "true") {
        form.dataset.submitted = "false";
        if (submit) {
          submit.disabled = false;
          submit.textContent = buttonLabel;
        }
        if (whatsappLink) {
          whatsappLink.hidden = true;
          whatsappLink.style.display = "";
        }
        if (status) status.hidden = true;
      }
    };
    form?.addEventListener("input", onFormInput);
    form?.addEventListener("change", onFormInput);
    const submitForm = async (event: Event) => {
      event.preventDefault();
      if (!form || submitting || form.dataset.submitted === "true") return;
      const data = new FormData(form);
      const name = String(data.get("nama") || "").trim();
      const phone = String(data.get("kontak") || "").trim();
      const need = String(data.get("kebutuhan") || "").trim();
      const inquiry = String(data.get("pesan") || "").trim();
      const message = `${need ? `${need}: ` : ""}${inquiry}`;
      const whatsappMessage = [
        "Halo Anugrah Plastik, saya ingin minta penawaran.",
        "",
        `Nama: ${name}`,
        `Kontak: ${phone}`,
        `Kebutuhan: ${need || "-"}`,
        `Pesan: ${inquiry}`,
      ].join("\n");
      let storedEntry: AnalyticsEntry | null = null;
      if (analyticsConsent()) {
        try {
          storedEntry = JSON.parse(
            window.sessionStorage.getItem("ap-analytics-entry-v1") ?? "null",
          ) as AnalyticsEntry | null;
        } catch {
          // A malformed browser value must not block a customer's request.
        }
      }
      const attribution = storedEntry?.attribution ?? campaignAttribution(window.location.search);
      const validation = leadFormSchema.safeParse({
        name,
        phone,
        message,
        landingPath: window.location.pathname,
        website: "",
        attribution,
      });
      const errors: Partial<Record<FieldName, string>> = {};
      if (!validation.success) {
        for (const issue of validation.error.issues) {
          const field = issue.path[0] as FieldName;
          if (field in fieldIds && !errors[field]) errors[field] = issue.message;
        }
      }
      if (inquiry.length < 10) errors.message = "Ceritakan kebutuhan Anda minimal 10 karakter.";
      if (Object.keys(errors).length) {
        showErrors(errors);
        return;
      }
      showErrors({});
      trackForm("form_submit_attempt");
      submitting = true;
      editableFields.forEach((field) => (field.disabled = true));
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Menyimpan permintaan…";
      }
      if (status) {
        status.hidden = false;
        status.dataset.state = "pending";
        status.removeAttribute("role");
        status.textContent = "Menyimpan permintaan Anda terlebih dahulu.";
      }
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            name,
            phone,
            message,
            landingPath: window.location.pathname,
            website: "",
            attribution,
            referrer: storedEntry?.referrer ?? null,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          conversionId?: string;
          message?: string;
          fieldErrors?: Partial<Record<FieldName, string>>;
        };
        if (!response.ok) {
          if (payload.fieldErrors) showErrors(payload.fieldErrors);
          throw new Error(
            response.status >= 500
              ? "Server belum memberi kepastian penyimpanan. Jangan langsung mengirim ulang; Anda dapat menghubungi kami lewat WhatsApp."
              : payload.message || "Permintaan belum tersimpan. Coba lagi setelah memeriksa isian.",
          );
        }
        if (!payload.conversionId)
          throw new Error(
            "Server belum memberi kepastian penyimpanan. Jangan langsung mengirim ulang; Anda dapat menghubungi kami lewat WhatsApp.",
          );
        window.dispatchEvent(
          new CustomEvent("ap:analytics-track", {
            detail: {
              name: "form_submit",
              sectionKey: "ap-contact",
              elementKey: "request-form",
              conversionId: payload.conversionId,
            },
          }),
        );
        window.dispatchEvent(new CustomEvent("ap:google-ads-lead", { detail: { conversionId: payload.conversionId } }));
      } catch (error) {
        form.dataset.submitError = "true";
        if (status) {
          status.hidden = false;
          status.dataset.state = "error";
          status.setAttribute("role", "alert");
          status.textContent =
            error instanceof DOMException && error.name === "AbortError"
              ? "Koneksi terlalu lambat. Status penyimpanan belum pasti; jangan langsung mengirim ulang. Anda dapat menghubungi kami lewat WhatsApp."
              : error instanceof TypeError
                ? "Koneksi terputus. Status penyimpanan belum pasti; jangan langsung mengirim ulang. Anda dapat menghubungi kami lewat WhatsApp."
                : error instanceof Error
                  ? error.message
                  : "Permintaan belum dapat diproses. Periksa koneksi lalu coba lagi.";
        }
        if (submit) {
          submit.disabled = false;
          submit.textContent = buttonLabel;
        }
        if (whatsappLink) {
          whatsappLink.href = whatsappUrl(whatsappMessage);
          whatsappLink.textContent = "Hubungi WhatsApp langsung →";
          whatsappLink.hidden = false;
          whatsappLink.style.display = "inline-flex";
        }
        editableFields.forEach((field) => (field.disabled = false));
        submitting = false;
        return;
      } finally {
        window.clearTimeout(timeout);
      }
      form.dataset.submitError = "false";
      if (status) {
        status.hidden = false;
        status.dataset.state = "success";
        status.removeAttribute("role");
        status.textContent = "Permintaan tersimpan. Tekan tombol di bawah untuk melanjutkan percakapan di WhatsApp.";
      }
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Permintaan tersimpan";
      }
      form.dataset.submitted = "true";
      editableFields.forEach((field) => (field.disabled = false));
      if (whatsappLink) {
        whatsappLink.href = whatsappUrl(whatsappMessage);
        whatsappLink.textContent = "Lanjutkan di WhatsApp →";
        whatsappLink.hidden = false;
        whatsappLink.style.display = "inline-flex";
        whatsappLink.focus();
      }
      submitting = false;
    };
    form?.addEventListener("submit", submitForm);

    return () => {
      window.removeEventListener("scroll", updateHeader);
      window.removeEventListener("resize", updateBurger);
      burger?.removeEventListener("click", toggleMenu);
      mobileLinks.forEach((link) => link.removeEventListener("click", closeMenu));
      filterHandlers.forEach(({ button, handler }) => button.removeEventListener("click", handler));
      cardHandlers.forEach(({ card, handler }) => card.removeEventListener("click", handler));
      lightbox?.removeEventListener("click", closeLightbox);
      window.removeEventListener("keydown", closeOnEscape);
      navigationObserver.disconnect();
      revealObserver?.disconnect();
      marqueeToggle?.removeEventListener("click", toggleMarquee);
      faqHandlers.forEach(({ question, handler }) => question.removeEventListener("click", handler));
      form?.removeEventListener("submit", submitForm);
      form?.removeEventListener("input", onFormInput);
      form?.removeEventListener("change", onFormInput);
    };
  }, []);

  return null;
}
