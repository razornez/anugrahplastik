export function normalizeDemoWhatsAppNumber(raw: string | undefined) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const number = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return /^62[1-9]\d{7,11}$/.test(number) ? number : null;
}

export function getDemoWhatsAppNumber() {
  return process.env.NODE_ENV === "production"
    ? null
    : normalizeDemoWhatsAppNumber(process.env.DEMO_WHATSAPP_TEST_NUMBER);
}

export function prospectWhatsAppDestination(
  dataClass: string,
  leadPhone: string | null,
  demoTestNumber: string | null,
) {
  if (dataClass === "demo") return demoTestNumber;
  if (dataClass !== "production") return null;
  return leadPhone?.replace(/\D/g, "").replace(/^0/, "62") || null;
}
