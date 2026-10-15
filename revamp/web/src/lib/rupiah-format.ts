export function formatRupiahInput(value: string) {
  if (!value) return "";
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return value;
  const [whole, fraction] = value.split(".");
  const grouped = BigInt(whole).toLocaleString("id-ID");
  return `Rp ${grouped}${fraction ? `,${fraction}` : ""}`;
}

export function parseRupiahInput(display: string) {
  const cleaned = display
    .replace(/^\s*Rp\s*/i, "")
    .replaceAll(".", "")
    .replaceAll(" ", "");
  if (!/^\d*$/.test(cleaned)) return null;
  return cleaned.replace(/^0+(?=\d)/, "");
}
