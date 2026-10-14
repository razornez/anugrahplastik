"use client";

import { useEffect, useRef, useState } from "react";

type PinInputProps = {
  name?: string;
  id?: string;
  autoComplete?: "current-password" | "new-password" | "one-time-code";
  autoFocus?: boolean;
  describedBy?: string;
  warnWeak?: boolean;
};

export function PinInput({
  name = "pin",
  id,
  autoComplete = "new-password",
  autoFocus = false,
  describedBy,
  warnWeak = false,
}: PinInputProps) {
  const [value, setValue] = useState("");
  const [revealedIndex, setRevealedIndex] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const weak =
    warnWeak &&
    (/^(\d)\1{5}$/.test(value) ||
      ["012345", "123456", "234567", "345678", "456789", "987654", "876543", "765432", "654321"].includes(value));
  return (
    <span className="pin-input-wrap">
      <span className="pin-input" data-complete={value.length === 6 ? "true" : "false"}>
        <span className="pin-input__cells" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span className={index === value.length ? "is-current" : undefined} key={index}>
              {value[index] ? (index === revealedIndex ? value[index] : "•") : ""}
            </span>
          ))}
        </span>
        <input
          aria-describedby={describedBy}
          aria-label="PIN enam digit"
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          id={id}
          inputMode="numeric"
          maxLength={6}
          minLength={6}
          name={name}
          onChange={(event) => {
            const next = event.currentTarget.value.replace(/\D/g, "").slice(0, 6);
            setValue(next);
            setRevealedIndex(next.length - 1);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setRevealedIndex(-1), 650);
          }}
          pattern="[0-9]{6}"
          required
          type="text"
          value={value}
        />
      </span>
      {weak ? (
        <small className="pin-input-warning" role="status">
          PIN ini mudah ditebak. Anda tetap dapat menggunakannya.
        </small>
      ) : null}
    </span>
  );
}
