import Link from "next/link";
import { randomUUID } from "node:crypto";
import { simpleParser } from "mailparser";
import {
  createProspectFromEmail,
  linkEmailToTransaction,
  refreshMailbox,
  sendCsEmail,
} from "@/features/integrations/actions";
import { fetchEmailBody, getEmailRecord, getOutboxRecord, listEmails } from "@/features/integrations/mail-service";
import { decryptSecret } from "@/features/integrations/secrets";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { integrations } from "@/lib/database/schema";
import { EmailHtmlPreview } from "@/components/integrations/email-html-preview";
import { buildCompanyEmail, sanitizeIncomingEmailHtml } from "@/features/integrations/email-format";

export const instant = false;

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{
    folder?: string;
    before?: string;
    email?: string;
    compose?: string;
    sent?: string;
    synced?: string;
    sync?: string;
    q?: string;
    send?: string;
    link?: string;
  }>;
}) {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role)) redirect("/admin");
  const database = getDatabase();
  const [mailConnection] = database
    ? await database
        .select({ secretCiphertext: integrations.secretCiphertext, lastError: integrations.lastError })
        .from(integrations)
        .where(eq(integrations.key, "cs-mail"))
        .limit(1)
    : [];
  if (!mailConnection?.secretCiphertext)
    return (
      <section className="admin-page email-page">
        <header className="admin-page-heading">
          <div>
            <p className="admin-eyebrow">LAYANAN PELANGGAN</p>
            <h1>Email CS</h1>
            <p>Kotak masuk, balasan pelanggan, dan surat terkirim.</p>
          </div>
        </header>
        <article className="integration-card integration-not-connected">
          <span className="integration-mark integration-mark--mail">@</span>
          <div>
            <h2>Email CS belum tersambung</h2>
            <p>Administrator perlu menguji koneksi mailbox sebelum email dapat dibuka.</p>
            {mailConnection?.lastError ? <p className="integration-alert">Koneksi email perlu diperiksa.</p> : null}
            {user.role === "admin" ? (
              <Link className="admin-primary-button" href="/admin/settings/integrations">
                Siapkan koneksi email
              </Link>
            ) : (
              <p>Minta administrator menyiapkan koneksi email CS.</p>
            )}
          </div>
        </article>
      </section>
    );
  const params = await searchParams;
  const folder = params.folder === "sent" ? "sent" : "inbox";
  const listing = await listEmails(folder, params.before, params.q);
  if (listing === null)
    return (
      <section className="admin-page">
        <h1>Email CS</h1>
        <p>Database belum tersedia.</p>
      </section>
    );
  const picked = params.email
    ? folder === "inbox" || params.email.startsWith("mailbox:")
      ? await getEmailRecord(params.email.replace(/^mailbox:/, ""))
      : await getOutboxRecord(params.email.replace(/^outbox:/, ""))
    : null;
  let body = "Pilih satu email untuk melihat isi pesannya.";
  let htmlBody: string | null = null;
  let sender = "";
  let recipient = "";
  let subject = "";
  let attachments: Array<{ filename: string; contentType: string; size: number }> = [];
  if (picked && "uid" in picked) {
    const isInbox = folder === "inbox";
    sender = isInbox ? (picked.fromAddress ?? "") : "cs@anugrahplastik.com";
    subject = picked.subject;
    recipient = isInbox ? "cs@anugrahplastik.com" : (picked.toAddress ?? "");
    let raw: Buffer | null = null;
    let mailboxUnavailable = false;
    if (picked.size <= 25 * 1024 * 1024) {
      try {
        raw = await fetchEmailBody(folder, picked.uid, picked.uidValidity);
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
    recipient = picked.toAddress;
    subject = picked.subject;
    body = decryptSecret<{ body: string }>(picked.bodyCiphertext).body;
    htmlBody = buildCompanyEmail(body).html;
  }
  const emailRow = picked && "uid" in picked ? picked : null;
  return (
    <section className="admin-page email-page">
      <header className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">LAYANAN PELANGGAN</p>
          <h1>Email CS</h1>
          <p>Baca pesan pelanggan dan balas memakai alamat resmi Anugrah Plastik.</p>
        </div>
        <form action={refreshMailbox}>
          <button className="admin-secondary-button" type="submit">
            Segarkan kotak masuk
          </button>
        </form>
      </header>
      {params.synced ? (
        <p className="integration-success" role="status">
          Kotak email berhasil diperiksa.
        </p>
      ) : null}
      {params.sync === "error" ? (
        <p className="integration-alert" role="alert">
          Pemeriksaan mailbox gagal. Pesan yang sudah tersimpan tetap dapat dibuka; administrator dapat memperbaiki
          koneksi di Koneksi layanan.
        </p>
      ) : null}
      {mailConnection.lastError ? (
        <p className="integration-alert" role="status">
          Email CS masih tersimpan, tetapi layanan sedang perlu perhatian. Data lama tetap tersedia; minta administrator
          memeriksa koneksi.
        </p>
      ) : null}
      {params.sent ? (
        <p className="integration-success" role="status">
          Email sudah diterima server email untuk dikirim.
        </p>
      ) : null}
      {params.send === "check" ? (
        <p className="integration-alert" role="alert">
          Status pengiriman belum pasti. Periksa Email terkirim atau webmail sebelum mengirim ulang agar tidak terjadi
          duplikasi.
        </p>
      ) : null}
      {params.link === "not-found" ? (
        <p className="integration-alert" role="alert">
          Nomor transaksi tidak ditemukan. Periksa kembali nomor TRX.
        </p>
      ) : null}
      {params.link === "success" ? (
        <p className="integration-success" role="status">
          Email berhasil dikaitkan dengan transaksi.
        </p>
      ) : null}
      <div className="email-tabs">
        <Link aria-current={folder === "inbox" ? "page" : undefined} href="/admin/email?folder=inbox">
          Kotak masuk
        </Link>
        <Link aria-current={folder === "sent" ? "page" : undefined} href="/admin/email?folder=sent">
          Terkirim
        </Link>
        <Link className="email-compose-link" href={`/admin/email?folder=${folder}&compose=1`}>
          Tulis email
        </Link>
      </div>
      <form className="email-search" method="get">
        <input type="hidden" name="folder" value={folder} />
        <input aria-label="Cari email" name="q" placeholder="Cari pengirim atau subjek" defaultValue={params.q} />
        <button className="admin-secondary-button" type="submit">
          Cari
        </button>
        {params.q ? <Link href={`/admin/email?folder=${folder}`}>Hapus</Link> : null}
      </form>
      <div
        className={`email-workspace ${picked || params.compose ? "email-workspace--detail" : "email-workspace--list"}`}
      >
        <aside className="email-list" aria-label={folder === "inbox" ? "Daftar kotak masuk" : "Daftar email terkirim"}>
          {listing.items.length ? (
            listing.items.map((item) => (
              <Link
                className="email-list-item"
                aria-current={params.email === item.id ? "true" : undefined}
                href={`/admin/email?folder=${folder}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}&email=${item.id}`}
                key={item.id}
              >
                <span className="email-list-item__top">
                  <strong>
                    {folder === "inbox"
                      ? item.fromName || item.fromAddress || "Pengirim tidak dikenal"
                      : item.toAddress}
                  </strong>
                  <time>
                    {item.receivedAt
                      ? new Date(item.receivedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
                      : "—"}
                  </time>
                </span>
                <span>{item.subject}</span>
                <small>
                  {folder === "inbox"
                    ? item.fromAddress
                    : "source" in item && item.source === "mailbox"
                      ? "Terkirim dari mailbox"
                      : item.status === "sent"
                        ? "Terkirim dari ruang kerja"
                        : "Status perlu diperiksa"}
                </small>
              </Link>
            ))
          ) : (
            <div className="email-empty">
              <strong>
                {params.q
                  ? "Email tidak ditemukan"
                  : folder === "inbox"
                    ? "Belum ada email masuk"
                    : "Belum ada email terkirim"}
              </strong>
              <span>
                {folder === "inbox"
                  ? "Gunakan tombol segarkan untuk memeriksa mailbox."
                  : "Email terkirim dari mailbox dan ruang kerja tampil di sini."}
              </span>
            </div>
          )}
          {listing.next ? (
            <Link
              className="email-next-page"
              href={`/admin/email?folder=${folder}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}&before=${encodeURIComponent(listing.next)}`}
            >
              Muat email sebelumnya
            </Link>
          ) : null}
        </aside>
        <article className="email-detail">
          {picked || params.compose ? (
            <Link className="email-back" href={`/admin/email?folder=${folder}`}>
              ← Kembali ke daftar email
            </Link>
          ) : null}
          {params.compose ? (
            <>
              <p className="admin-eyebrow">PESAN BARU</p>
              <h2>Tulis email</h2>
              <form action={sendCsEmail} className="email-form">
                <label>
                  Ke
                  <input name="to" type="email" required autoComplete="email" placeholder="nama@perusahaan.com" />
                </label>
                <label>
                  Subjek
                  <input name="subject" maxLength={998} required />
                </label>
                <label>
                  Pesan
                  <textarea name="body" rows={8} maxLength={20000} required />
                </label>
                <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                <button className="admin-primary-button" type="submit">
                  Kirim email
                </button>
              </form>
            </>
          ) : picked ? (
            <>
              <p className="admin-eyebrow">{folder === "inbox" ? "EMAIL MASUK" : "EMAIL TERKIRIM"}</p>
              <h2>{subject}</h2>
              <div className="email-meta">
                <span>Dari</span>
                <strong>{sender || "—"}</strong>
                <span>Kepada</span>
                <strong>{recipient || "—"}</strong>
                <span>Waktu</span>
                <strong>
                  {emailRow?.receivedAt
                    ? new Date(emailRow.receivedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
                    : "—"}
                </strong>
              </div>
              {htmlBody ? <EmailHtmlPreview html={htmlBody} /> : <pre className="email-body">{body}</pre>}
              {attachments.length ? (
                <section className="email-attachments">
                  <h3>Lampiran</h3>
                  {attachments.map((attachment, index) => (
                    <a
                      href={`/api/admin/email/${emailRow?.id}/attachments/${index}`}
                      key={`${index}-${attachment.filename}`}
                    >
                      <span>↓</span>
                      <strong>{attachment.filename}</strong>
                      <small>{(attachment.size / 1024).toLocaleString("id-ID", { maximumFractionDigits: 0 })} KB</small>
                    </a>
                  ))}
                </section>
              ) : null}
              {folder === "inbox" && emailRow ? (
                <>
                  {emailRow.linkedTransactionId ? (
                    <p className="email-linked-note">
                      Email ini sudah dikaitkan ke transaksi{" "}
                      <Link href={`/admin/transactions/${emailRow.linkedTransactionId}`}>lihat transaksi</Link>.
                    </p>
                  ) : (
                    <details className="email-capture">
                      <summary>Kaitkan ke transaksi</summary>
                      <form action={linkEmailToTransaction} className="email-form">
                        <input type="hidden" name="emailId" value={emailRow.id} />
                        <label>
                          Nomor transaksi
                          <input
                            name="referenceNo"
                            required
                            pattern="TRX-[0-9]{4}-[0-9]{5}"
                            placeholder="TRX-2026-00001"
                          />
                        </label>
                        <button className="admin-secondary-button" type="submit">
                          Kaitkan email
                        </button>
                      </form>
                    </details>
                  )}
                  <details className="email-capture">
                    <summary>Catat sebagai prospek</summary>
                    <form action={createProspectFromEmail} className="email-form">
                      <input type="hidden" name="emailId" value={emailRow.id} />
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
                  <details className="email-reply">
                    <summary>Balas email</summary>
                    <form action={sendCsEmail} className="email-form">
                      <input type="hidden" name="to" value={sender} />
                      <input type="hidden" name="replyToId" value={emailRow.id} />
                      <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                      <label>
                        Subjek
                        <input
                          name="subject"
                          required
                          maxLength={998}
                          defaultValue={subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`}
                        />
                      </label>
                      <label>
                        Pesan
                        <textarea name="body" rows={5} required maxLength={20000} />
                      </label>
                      <button className="admin-primary-button" type="submit">
                        Kirim balasan
                      </button>
                    </form>
                  </details>
                </>
              ) : null}
            </>
          ) : (
            <div className="email-detail-empty">
              <span aria-hidden="true">✉</span>
              <h2>Pilih email</h2>
              <p>Isi email tampil di sini. Lampiran tidak diunduh atau disimpan otomatis.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
