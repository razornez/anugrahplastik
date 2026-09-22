"use client";

import { useLayoutEffect } from "react";

const whatsappNumber = "628122339587";

function whatsappUrl(message: string) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export function LandingInteractions() {
  useLayoutEffect(() => {
    const root = document.getElementById("ap-root");
    if (!root) return;

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
    const updateBurger = () => {
      if (burger) burger.style.display = window.innerWidth <= 900 ? "flex" : "none";
    };
    const toggleMenu = () => {
      if (mobile) mobile.style.display = mobile.style.display === "block" ? "none" : "block";
    };
    burger?.addEventListener("click", toggleMenu);
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
      if (event.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", closeOnEscape);

    const faqHandlers = Array.from(root.querySelectorAll<HTMLElement>(".ap-faq-item")).flatMap((item) => {
      const question = item.querySelector<HTMLElement>(".ap-faq-q");
      const answer = item.querySelector<HTMLElement>(".ap-faq-a");
      const icon = item.querySelector<HTMLElement>(".ap-faq-ic");
      if (!question || !answer || !icon) return [];
      const handler = () => {
        const opening = !answer.style.maxHeight || answer.style.maxHeight === "0px";
        root.querySelectorAll<HTMLElement>(".ap-faq-a").forEach((element) => (element.style.maxHeight = "0px"));
        root.querySelectorAll<HTMLElement>(".ap-faq-ic").forEach((element) => {
          element.style.transform = "none";
          element.style.background = "#EAF1FD";
          element.style.color = "#1457C7";
          element.textContent = "+";
        });
        if (opening) {
          answer.style.maxHeight = `${answer.scrollHeight + 40}px`;
          icon.style.transform = "rotate(45deg)";
          icon.style.background = "#1457C7";
          icon.style.color = "#fff";
        }
      };
      question.addEventListener("click", handler);
      return [{ question, handler }];
    });

    const form = document.getElementById("ap-form") as HTMLFormElement | null;
    const submitForm = async (event: Event) => {
      event.preventDefault();
      if (!form) return;
      const data = new FormData(form);
      const name = String(data.get("nama") || "").trim();
      const phone = String(data.get("kontak") || "").trim();
      const need = String(data.get("kebutuhan") || "").trim();
      const inquiry = String(data.get("pesan") || "").trim();
      if (!name || !phone || !inquiry) {
        form.reportValidity();
        return;
      }
      const query = new URLSearchParams(window.location.search);
      const attribution = Object.fromEntries(
        ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
          .map((key) => [key, query.get(key)])
          .filter(([, value]) => Boolean(value)),
      );
      try {
        const response = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            phone,
            message: `${need ? `${need}: ` : ""}${inquiry}`,
            landingPath: `${window.location.pathname}${window.location.search}`,
            website: "",
            attribution,
          }),
        });
        if (!response.ok) throw new Error("Lead tidak tersimpan");
      } catch {
        form.dataset.submitError = "true";
        return;
      }
      form.dataset.submitError = "false";
      const message = [
        "Halo Anugrah Plastik, saya ingin minta penawaran.",
        "",
        `Nama: ${name}`,
        `Kontak: ${phone}`,
        `Kebutuhan: ${need || "-"}`,
        `Pesan: ${inquiry}`,
      ].join("\n");
      window.dispatchEvent(
        new CustomEvent("ap:analytics-track", {
          detail: { name: "form_submit", sectionKey: "ap-contact", elementKey: "request-form" },
        }),
      );
      window.open(whatsappUrl(message), "_blank", "noopener,noreferrer");
    };
    form?.addEventListener("submit", submitForm);

    return () => {
      window.removeEventListener("scroll", updateHeader);
      window.removeEventListener("resize", updateBurger);
      burger?.removeEventListener("click", toggleMenu);
      filterHandlers.forEach(({ button, handler }) => button.removeEventListener("click", handler));
      cardHandlers.forEach(({ card, handler }) => card.removeEventListener("click", handler));
      lightbox?.removeEventListener("click", closeLightbox);
      window.removeEventListener("keydown", closeOnEscape);
      navigationObserver.disconnect();
      revealObserver?.disconnect();
      faqHandlers.forEach(({ question, handler }) => question.removeEventListener("click", handler));
      form?.removeEventListener("submit", submitForm);
    };
  }, []);

  return null;
}
