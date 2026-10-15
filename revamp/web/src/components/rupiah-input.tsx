"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { formatRupiahInput, parseRupiahInput } from "@/lib/rupiah-format";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "name" | "value" | "onChange"> & {
  name?: string;
  value: string;
  onChange: (value: string) => void;
};

export function RupiahInput({ name, value, onChange, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const node = input.current;
    if (!node) return;
    const restore = (event: Event) => {
      const raw = (event as CustomEvent<string>).detail;
      const parsed = parseRupiahInput(raw);
      if (parsed !== null) onChange(parsed);
    };
    node.addEventListener("ap:restore-draft", restore);
    return () => node.removeEventListener("ap:restore-draft", restore);
  }, [onChange]);
  return (
    <>
      {name ? <input name={name} type="hidden" value={value} /> : null}
      <input
        {...props}
        ref={input}
        data-draft-money={name || undefined}
        type="text"
        inputMode="numeric"
        value={formatRupiahInput(value)}
        onChange={(event) => {
          const position = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
          const digitsBefore = (event.currentTarget.value.slice(0, position).match(/\d/g) ?? []).length;
          const parsed = parseRupiahInput(event.currentTarget.value);
          if (parsed === null) {
            event.currentTarget.setCustomValidity("Isi nominal Rupiah dengan angka saja.");
            return;
          }
          event.currentTarget.setCustomValidity("");
          onChange(parsed);
          requestAnimationFrame(() => {
            const node = input.current;
            if (!node) return;
            const displayed = node.value;
            let seen = 0;
            let next = displayed.length;
            for (let index = 0; index < displayed.length; index++) {
              if (/\d/.test(displayed[index])) seen++;
              if (seen === digitsBefore) {
                next = index + 1;
                break;
              }
            }
            node.setSelectionRange(next, next);
          });
        }}
      />
    </>
  );
}

export function UncontrolledRupiahInput({
  defaultValue = "",
  ...props
}: Omit<Props, "value" | "onChange"> & { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  return <RupiahInput {...props} value={value} onChange={setValue} />;
}
