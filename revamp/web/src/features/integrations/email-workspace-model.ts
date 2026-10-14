import { z } from "zod";

export type EmailRecipients = { to: string[]; cc: string[]; bcc: string[] };
export const maxUploadBytes = 15 * 1024 * 1024;

export function parseRecipients(input: { to: string; cc?: string; bcc?: string }, complete = true): EmailRecipients {
  const seen = new Set<string>();
  const parse = (raw = "") =>
    raw
      .split(/[,;]/)
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        if (/[\r\n]/.test(value) || !z.email().safeParse(value).success || value.length > 255)
          throw new Error(`Alamat email tidak valid: ${value.slice(0, 80)}`);
        const key = value.toLowerCase();
        if (seen.has(key)) throw new Error("Alamat penerima berulang pada To, CC, atau BCC.");
        seen.add(key);
        return value;
      });
  const result = { to: parse(input.to), cc: parse(input.cc), bcc: parse(input.bcc) };
  if (complete && !result.to.length) throw new Error("Isi minimal satu penerima To.");
  if (seen.size > 10) throw new Error("Maksimal 10 penerima To dan CC.");
  return result;
}

export function mailThreadKey(messageId: string | null, inReplyTo: string | null, references?: string | null) {
  const ids = (references ?? "").match(/<[^<>\s]{1,498}>/g) ?? [];
  const valid = (value: string | null) => (value && /^<[^<>\s]{1,498}>$/.test(value) ? value : null);
  return ids[0] ?? valid(inReplyTo) ?? valid(messageId);
}

export function outgoingStatusLabel(status: string) {
  const labels: Record<string, string> = {
    prepared: "Siap diperiksa",
    pending: "Sedang diproses",
    sent: "Diterima server email",
    partial: "Ditolak sebagian",
    failed: "Gagal sebelum diterima",
    bounced: "Gagal diterima",
    attachment_blocked: "Lampiran diblokir",
    uncertain: "Status belum pasti",
    simulated: "Uji lokal, tidak dikirim",
    stale: "Pratinjau perlu diperbarui",
  };
  return labels[status] ?? "Status perlu ditinjau";
}

export function safelyFailedBeforeAcceptance(error: unknown) {
  const item = error as { code?: string; command?: string; responseCode?: number };
  return (
    ["EAUTH", "EDNS", "ECONNECTION"].includes(item?.code ?? "") ||
    (["CONN", "AUTH", "EHLO", "HELO", "STARTTLS", "MAIL FROM", "RCPT TO"].includes(item?.command ?? "") &&
      (item?.responseCode ?? 0) >= 400)
  );
}

export function replyRecipients(
  sender: string,
  replyTo: string | null,
  to: string | null,
  cc: string | null,
  own: string,
  all: boolean,
) {
  const primary = (replyTo || sender)
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter((item) => z.email().safeParse(item).success);
  const others = all ? `${to ?? ""},${cc ?? ""}`.split(/[,;]/) : [];
  const seen = new Set(primary.map((item) => item.toLowerCase()));
  const copies = others
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!z.email().safeParse(item).success || key === own.toLowerCase() || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return {
    to: primary.filter((item) => item.toLowerCase() !== own.toLowerCase()).join(", "),
    cc: copies.join(", "),
    bcc: "",
  };
}
