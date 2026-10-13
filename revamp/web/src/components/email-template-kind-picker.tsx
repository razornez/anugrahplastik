"use client";

import { useRouter } from "next/navigation";

const templateKinds = [
  ["layout", "Tata letak"],
  ["new", "Pesan baru"],
  ["reply", "Balasan"],
  ["quotation", "Surat penawaran"],
  ["invoice", "Invoice"],
  ["delivery", "Surat jalan"],
] as const;

export function EmailTemplateKindPicker({ value }: { value: string }) {
  const router = useRouter();
  return (
    <label className="email-template-kind-picker">
      Jenis template
      <select
        aria-label="Jenis template email"
        value={value}
        onChange={(event) => router.push(`/admin/settings/email-templates?kind=${event.target.value}`)}
      >
        {templateKinds.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
