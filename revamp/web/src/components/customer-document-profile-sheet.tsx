"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AdminSheet, useAdminToast } from "@/components/admin-ui";
import { updateCustomerDocumentProfile } from "@/features/operations/customer-document-actions";
import type {
  CustomerDocumentProfileInput,
  CustomerDocumentProfileState,
} from "@/features/operations/customer-document-profile";

type Field = keyof CustomerDocumentProfileInput;

const labels: Record<Field, string> = {
  legalName: "Nama pelanggan",
  email: "Email",
  phone: "Telepon",
  taxId: "NPWP",
  billingAddress: "Alamat penagihan",
  deliveryAddress: "Alamat pengiriman",
};

export function CustomerDocumentProfileSheet({
  transactionId,
  initial,
  focusField = "billingAddress",
  label = "Lengkapi sekarang",
}: {
  transactionId: string;
  initial: CustomerDocumentProfileInput;
  focusField?: Field;
  label?: string;
}) {
  const router = useRouter();
  const notify = useAdminToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<CustomerDocumentProfileState>({ ok: false });
  const focusRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => focusRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (state.message && !state.ok) errorRef.current?.focus();
  }, [state]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState({ ok: false });
    try {
      const result = await updateCustomerDocumentProfile(new FormData(event.currentTarget));
      setState(result);
      if (!result.ok) return;
      notify({ title: "Data pelanggan diperbarui", message: "Kesiapan dokumen diperiksa ulang.", tone: "success" });
      setOpen(false);
      router.refresh();
    } catch {
      setState({ ok: false, message: "Koneksi terputus. Data belum tersimpan; coba lagi." });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button className="transaction-requirement-action" onClick={() => setOpen(true)} type="button">
        {label}
      </button>
      <AdminSheet
        className="admin-sheet--customer-document"
        description="Perubahan selalu berlaku pada transaksi ini. Master Pelanggan hanya berubah jika Anda memilihnya."
        onOpenChange={setOpen}
        open={open}
        title="Data dokumen pelanggan"
      >
        <form className="customer-document-profile-form" noValidate onSubmit={submit}>
          <input name="transactionId" type="hidden" value={transactionId} />
          {state.message && !state.ok ? (
            <p className="admin-form-error-summary" ref={errorRef} role="alert" tabIndex={-1}>
              {state.message}
            </p>
          ) : null}
          <div className="customer-document-profile-form__fields">
            {(Object.keys(labels) as Field[]).map((field) => {
              const multiline = field === "billingAddress" || field === "deliveryAddress";
              const common = {
                "aria-describedby": state.fieldErrors?.[field] ? `document-customer-${field}-error` : undefined,
                "aria-invalid": Boolean(state.fieldErrors?.[field]),
                defaultValue: initial[field],
                id: `document-customer-${field}`,
                maxLength: multiline ? 1200 : field === "legalName" ? 180 : 255,
                name: field,
              };
              return (
                <label className={multiline ? "is-wide" : undefined} key={field}>
                  {labels[field]}
                  {multiline ? (
                    <textarea
                      {...common}
                      ref={(node) => {
                        if (field === focusField) focusRef.current = node;
                      }}
                      rows={3}
                    />
                  ) : (
                    <input
                      {...common}
                      ref={(node) => {
                        if (field === focusField) focusRef.current = node;
                      }}
                      required={field === "legalName"}
                      type={field === "email" ? "email" : "text"}
                    />
                  )}
                  {state.fieldErrors?.[field] ? (
                    <small id={`document-customer-${field}-error`} role="alert">
                      {state.fieldErrors[field]}
                    </small>
                  ) : null}
                </label>
              );
            })}
          </div>
          <label className="admin-check-row customer-document-profile-form__master-sync">
            <input name="updateMaster" type="checkbox" />
            <span>
              Perbarui juga Master Pelanggan
              <small>Gunakan bila data ini juga benar untuk transaksi pelanggan berikutnya.</small>
            </span>
          </label>
          <div className="customer-document-profile-form__actions">
            <button aria-busy={pending} disabled={pending} type="submit">
              {pending ? "Menyimpan…" : "Simpan data pelanggan"}
            </button>
          </div>
        </form>
      </AdminSheet>
    </>
  );
}
