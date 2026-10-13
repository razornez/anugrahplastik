const durationUnits = [
  { label: "hari", seconds: 86_400 },
  { label: "jam", seconds: 3_600 },
  { label: "menit", seconds: 60 },
] as const;

const integer = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export function formatAdminCount(value: number): string {
  return integer.format(Math.max(0, Math.floor(value)));
}

export function formatAdminDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 60) return "kurang dari 1 menit";

  let remaining = Math.max(0, Math.floor(totalSeconds));
  const parts: string[] = [];
  for (const unit of durationUnits) {
    const value = Math.floor(remaining / unit.seconds);
    if (!value) continue;
    parts.push(`${formatAdminCount(value)} ${unit.label}`);
    remaining %= unit.seconds;
    if (parts.length === 2) break;
  }

  return parts.join(" ");
}
