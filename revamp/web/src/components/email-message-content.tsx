import { simpleParser } from "mailparser";
import { fetchEmailBody, getEmailRecord, getOutboxRecord } from "@/features/integrations/mail-service";
import { decryptSecret } from "@/features/integrations/secrets";
import { buildCompanyEmail, sanitizeIncomingEmailHtml } from "@/features/integrations/email-format";
import { inlineArchivedTemplateImages } from "@/features/integrations/email-templates";
import { EmailHtmlPreview } from "@/components/integrations/email-html-preview";
import { createProspectFromEmail } from "@/features/integrations/actions";
import { startRejectedRecipientsDraft } from "@/features/integrations/email-workspace-actions";
import { getSession } from "@/lib/auth/session";

type Record =
  NonNullable<Awaited<ReturnType<typeof getEmailRecord>>> | NonNullable<Awaited<ReturnType<typeof getOutboxRecord>>>;
export async function EmailMessageContent({ picked }: { picked: Record }) {
  const user = await getSession();
  let body = "Pilih satu email untuk melihat isi pesannya.";
  let htmlBody: string | null = null;
  let sender = "";
  let subject = "";
  let attachments: Array<{ filename: string; contentType: string; size: number }> = [];
  if (picked && "uid" in picked) {
    const isInbox = picked.folder === "inbox";
    sender = isInbox ? (picked.fromAddress ?? "") : "cs@anugrahplastik.com";
    subject = picked.subject;
    let raw: Buffer | null = null;
    let mailboxUnavailable = false;
    if (picked.size <= 25 * 1024 * 1024) {
      try {
        raw = await fetchEmailBody(picked.folder === "inbox" ? "inbox" : "sent", picked.uid, picked.uidValidity);
      } catch {
        mailboxUnavailable = true;
      }
    }
    if (picked.size > 25 * 1024 * 1024)
      body = "Email ini lebih besar dari 25 MB. Untuk keamanan dan kestabilan, buka melalui webmail.";
    else if (raw && raw.byteLength <= 25 * 1024 * 1024) {
      try {
        const parsed = await simpleParser(raw);
        body = parsed.text?.trim() || "Email ini hanya menyertakan isi berformat HTML.";
        if (typeof parsed.html === "string" && parsed.html.trim()) htmlBody = sanitizeIncomingEmailHtml(parsed.html);
        attachments = parsed.attachments.map((item) => ({
          filename: item.filename || "Lampiran",
          contentType: item.contentType,
          size: item.size,
        }));
      } catch {
        body = "Isi email tidak dapat dibaca. Coba segarkan daftar email.";
      }
    } else if (raw) body = "Email ini lebih besar dari 25 MB. Untuk keamanan dan kestabilan, buka melalui webmail.";
    else if (mailboxUnavailable)
      body =
        "Isi email ini belum tersimpan di aplikasi dan mailbox sedang tidak dapat dihubungi. Coba lagi setelah koneksi email pulih.";
    else body = "Isi email tidak tersedia di server mailbox.";
  } else if (picked && "bodyCiphertext" in picked) {
    sender = "cs@anugrahplastik.com";
    subject = picked.subject;
    body = decryptSecret<{ body: string }>(picked.bodyCiphertext).body;
    htmlBody = picked.htmlCiphertext
      ? sanitizeIncomingEmailHtml(
          await inlineArchivedTemplateImages(decryptSecret<{ html: string }>(picked.htmlCiphertext).html),
        )
      : buildCompanyEmail(body).html;
    if (picked.snapshotCiphertext) {
      const snapshot = decryptSecret<{
        html: string;
        text: string;
        attachments: { filename: string; contentType: string; content: string; cid?: string }[];
      }>(picked.snapshotCiphertext);
      body = snapshot.text;
      htmlBody = sanitizeIncomingEmailHtml(
        snapshot.attachments.reduce(
          (html, file) =>
            file.cid ? html.replaceAll(`cid:${file.cid}`, `data:${file.contentType};base64,${file.content}`) : html,
          snapshot.html,
        ),
      );
      if (picked.sentBy === user?.id || user?.role === "admin")
        attachments = snapshot.attachments
          .filter((file) => !file.cid)
          .map((file) => ({
            filename: file.filename,
            contentType: file.contentType,
            size: Buffer.from(file.content, "base64").length,
          }));
    }
  }

  const emailRow = "uid" in picked ? picked : null;
  const attempt = "resultCiphertext" in picked ? picked : null;
  const canReview = Boolean(attempt && (attempt.sentBy === user?.id || user?.role === "admin"));
  const delivery =
    canReview && attempt?.resultCiphertext
      ? decryptSecret<{ accepted: string[]; rejected: string[] }>(attempt.resultCiphertext)
      : null;
  return (
    <>
      {delivery && attempt?.status !== "simulated" ? (
        <section className="email-thread-history" aria-label="Status per penerima">
          <h3>Hasil penerimaan server email</h3>
          <p>Diterima server: {delivery.accepted.join(", ") || "Belum ada konfirmasi"}</p>
          <p>Ditolak server: {delivery.rejected.join(", ") || "Tidak tercatat"}</p>
          <p>Penerimaan server bukan bukti bahwa email sudah masuk ke kotak masuk pelanggan.</p>
          {attempt?.status === "partial" ? (
            <form action={startRejectedRecipientsDraft}>
              <input type="hidden" name="attemptId" value={attempt.id} />
              <button className="admin-secondary-button">Buat draf hanya untuk penerima yang ditolak</button>
            </form>
          ) : null}
        </section>
      ) : null}{" "}
      {htmlBody ? <EmailHtmlPreview html={htmlBody} /> : <pre className="email-body">{body}</pre>}
      {attachments.length ? (
        <section className="email-attachments">
          <h3>Lampiran</h3>
          {attachments.map((attachment, index) => (
            <a
              href={
                emailRow
                  ? `/api/admin/email/${emailRow.id}/attachments/${index}`
                  : `/api/admin/email-outbox/${picked.id}/files/${index}`
              }
              key={`${index}-${attachment.filename}`}
            >
              <span>↓</span>
              <strong>{attachment.filename}</strong>
              <small>{(attachment.size / 1024).toLocaleString("id-ID", { maximumFractionDigits: 0 })} KB</small>
            </a>
          ))}
        </section>
      ) : null}
      {emailRow?.folder === "inbox" ? (
        <>
          {" "}
          <details className="email-capture">
            <summary>Catat sebagai prospek</summary>
            <form action={createProspectFromEmail} className="email-form">
              <input type="hidden" name="emailId" value={emailRow?.id} />
              <label>
                Nama kontak
                <input name="name" required minLength={2} maxLength={120} />
              </label>
              <label>
                Email
                <input name="email" type="email" required defaultValue={sender} />
              </label>
              <label>
                Ringkasan kebutuhan
                <textarea
                  name="message"
                  rows={3}
                  required
                  defaultValue={`Email: ${subject}\n\n${body.slice(0, 1000)}`}
                />
              </label>
              <button className="admin-secondary-button" type="submit">
                Simpan sebagai prospek
              </button>
            </form>
          </details>
        </>
      ) : null}
    </>
  );
}
