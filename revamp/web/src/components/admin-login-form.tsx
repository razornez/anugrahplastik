"use client";

import { useState } from "react";

type LoginFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  email?: string;
  password?: string;
  message?: string | null;
};

export function AdminLoginForm({ action, email = "", password = "", message }: LoginFormProps) {
  const [usePin, setUsePin] = useState(false);
  return (
    <form action={action} className="login-form">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" defaultValue={email} required />
      </label>
      {usePin ? (
        <label>
          PIN enam digit
          <input
            name="pin"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            autoFocus
          />
        </label>
      ) : (
        <label>
          Kata sandi
          <input name="password" type="password" autoComplete="current-password" defaultValue={password} required />
        </label>
      )}
      <button className="login-method" type="button" onClick={() => setUsePin((value) => !value)}>
        {usePin ? "Masuk dengan kata sandi" : "Masuk dengan PIN"}
      </button>
      {message ? (
        <p className="login-message" role="alert">
          {message}
        </p>
      ) : null}
      <button className="login-submit" type="submit">
        Masuk ke ruang kerja
      </button>
    </form>
  );
}
