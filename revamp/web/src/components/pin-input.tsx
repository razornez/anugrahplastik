"use client";

import { useState } from "react";

export function PinInput() {
  const [visible, setVisible] = useState(false);
  return (
    <span className="pin-input">
      <input
        name="pin"
        type={visible ? "text" : "password"}
        inputMode="numeric"
        autoComplete="new-password"
        pattern="[0-9]{6}"
        minLength={6}
        maxLength={6}
        required
      />
      <button
        aria-label={visible ? "Sembunyikan PIN" : "Tampilkan PIN"}
        onClick={() => setVisible((value) => !value)}
        type="button"
      >
        {visible ? "Sembunyikan" : "Tampilkan"}
      </button>
    </span>
  );
}
