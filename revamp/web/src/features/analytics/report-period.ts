export function jakartaReportStart(days: number, now = new Date()) {
  if (!Number.isInteger(days) || days < 1) throw new RangeError("Jumlah hari harus positif.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  const firstDay = new Date(`${today}T00:00:00+07:00`);
  firstDay.setUTCDate(firstDay.getUTCDate() - days + 1);
  return firstDay;
}

export function jakartaReportRange(days: number, now = new Date()) {
  return { start: jakartaReportStart(days, now), prior: jakartaReportStart(days * 2, now), now };
}
