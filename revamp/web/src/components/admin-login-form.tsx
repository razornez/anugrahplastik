"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { PinInput } from "@/components/pin-input";

type LoginFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  username?: string;
  message?: string | null;
  status?: string | null;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button aria-busy={pending} className="login-submit" disabled={pending} type="submit">
      {pending ? "Memeriksa…" : "Masuk"}
    </button>
  );
}

export function AdminLoginForm({ action, username = "", message, status }: LoginFormProps) {
  return (
    <form action={action} className="login-form">
      {status === "pin-updated" ? (
        <p className="login-message login-message--success">PIN berhasil disimpan. Silakan masuk.</p>
      ) : null}
      <label htmlFor="username">Username</label>
      <input
        autoCapitalize="none"
        autoComplete="username"
        defaultValue={username}
        id="username"
        maxLength={24}
        minLength={3}
        name="username"
        pattern="[a-z0-9.]{3,24}"
        required
        spellCheck={false}
      />
      <label htmlFor="login-pin">PIN</label>
      <PinInput autoComplete="current-password" id="login-pin" />
      <label className="login-private-device">
        <input name="privateDevice" type="checkbox" value="yes" />
        <span>
          <strong>Perangkat pribadi</strong>
          <small>Ingat username dan pertahankan sesi hingga 30 hari.</small>
        </span>
      </label>
      {message ? (
        <p className="login-message" role="alert">
          {message}
        </p>
      ) : null}
      <SubmitButton />
      <Link className="login-help-link" href="/admin/forgot-pin">
        Bantuan masuk
      </Link>
    </form>
  );
}
