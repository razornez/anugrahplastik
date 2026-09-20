"use client";

import { useActionState, useEffect } from "react";
import { submitLead, type LeadFormState } from "@/features/leads/actions";

const initialLeadFormState: LeadFormState = {
  status: "idle",
  message: "",
};

export function LeadForm() {
  const [state, formAction, isPending] = useActionState(submitLead, initialLeadFormState);

  useEffect(() => {
    if (state.whatsappUrl) window.open(state.whatsappUrl, "_blank", "noopener,noreferrer");
  }, [state.whatsappUrl]);

  return (
    <form className="contact-form" action={formAction} noValidate>
      <input name="landingPath" type="hidden" value="/" />
      <label className="trap-field" aria-hidden="true">
        Website
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </label>
      <label>
        Nama
        <input name="name" placeholder="Nama Anda" autoComplete="name" aria-describedby="name-error" />
        {state.fieldErrors?.name ? <em id="name-error">{state.fieldErrors.name}</em> : null}
      </label>
      <label>
        Nomor WhatsApp
        <input
          name="phone"
          inputMode="tel"
          placeholder="Contoh: 0812xxxx"
          autoComplete="tel"
          aria-describedby="phone-error"
        />
        {state.fieldErrors?.phone ? <em id="phone-error">{state.fieldErrors.phone}</em> : null}
      </label>
      <label>
        Kebutuhan
        <textarea
          name="message"
          rows={3}
          placeholder="Ceritakan part atau produk yang ingin dibuat"
          aria-describedby="message-error"
        />
        {state.fieldErrors?.message ? <em id="message-error">{state.fieldErrors.message}</em> : null}
      </label>
      <button className="ap-wa" type="submit" disabled={isPending}>
        {isPending ? "Menyimpan..." : "Kirim via WhatsApp"} <span>→</span>
      </button>
      <p className={`form-message ${state.status}`} aria-live="polite">
        {state.message}
      </p>
      <small>Data Anda hanya digunakan untuk menindaklanjuti kebutuhan ini.</small>
    </form>
  );
}
