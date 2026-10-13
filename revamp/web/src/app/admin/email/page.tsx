import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { Suspense } from "react";
import { EmailMessageContent } from "@/components/email-message-content";
import { MailboxRefreshControl } from "@/components/mailbox-refresh-control";
import { EmailTransactionPicker } from "@/components/email-transaction-picker";
import { getEmailRecord, getOutboxRecord } from "@/features/integrations/mail-service";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { integrations } from "@/lib/database/schema";
import { EmailDraftComposer } from "@/components/email-draft-composer";
import { EmailDetailDrawer } from "@/components/email-detail-drawer";
import { EmailDetailShimmer } from "@/components/email-loading-shimmer";
import { EmailResultLink, EmailListScrollRestorer } from "@/components/email-list-navigation";
import { EmailSelectionLoading } from "@/components/email-selection-loading";
import { listDrafts, readDraft } from "@/features/integrations/email-drafts";
import { startEmailDraft } from "@/features/integrations/email-workspace-actions";
import { outgoingStatusLabel } from "@/features/integrations/email-workspace-model";
import "./email-workspace.css";
import { listConversations, conversationMessages } from "@/features/integrations/email-conversations";
import { decryptSecret, hasIntegrationEncryptionKey } from "@/features/integrations/secrets";
import type { MailSettings } from "@/features/integrations/mail-service";
import {
  INTEGRATION_HEALTH_STALE_HOURS,
  getIntegrationHealth,
  getSchedulerHealth,
  type IntegrationHealth,
} from "@/features/integrations/integration-health";
import {
  getActiveIntegrationSyncRun,
  getSchedulerConfiguration,
  getLastScheduledIntegrationRun,
  getRecentIntegrationSyncRuns,
} from "@/features/integrations/sync-runner";
import { getMailboxOperationalHealth } from "@/features/integrations/mailbox-operational-health";

export const instant = false;

function formatWib(value: Date | null | undefined) {
  return value ? `${value.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB` : "Belum ada";
}

function EmailAccount({
  address,
  health,
  nextExpectedAt,
  lastSyncAt,
  lastAttempt,
  isLocalRuntime,
  schedulerLabel,
}: {
  address: string | null;
  health: IntegrationHealth;
  nextExpectedAt: Date | null;
  lastSyncAt: Date | null | undefined;
  lastAttempt: { startedAt: Date; mailStatus: string; mailCount: number } | null;
  isLocalRuntime: boolean;
  schedulerLabel: string;
}) {
  return (
    <section className={`email-account is-${health.level}`} aria-label="Status akun Email CS">
      <svg className="email-account__icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m4 7 8 6 8-6" />
      </svg>
      <div className="email-account__identity">
        <span>Email CS</span>
        <strong>{address ?? "Alamat email belum tersedia"}</strong>
        <p>{address ? health.summary : "Administrator perlu memeriksa konfigurasi email di Koneksi layanan."}</p>
      </div>
      <span className="email-account__status">{health.label}</span>
      <dl className="email-account__facts">
        <div>
          <dt>Terakhir berhasil</dt>
          <dd>{formatWib(lastSyncAt)}</dd>
        </div>
        <div>
          <dt>Percobaan terakhir</dt>
          <dd>
            {lastAttempt
              ? `${formatWib(lastAttempt.startedAt)} · ${lastAttempt.mailStatus === "success" ? "Berhasil" : lastAttempt.mailStatus === "busy" ? "Sedang berjalan" : "Gagal"}`
              : "Belum ada"}
          </dd>
        </div>
        <div>
          <dt>{isLocalRuntime ? "Pembaruan otomatis" : "Scheduler VPS"}</dt>
          <dd>{isLocalRuntime ? "Mode lokal, dijalankan manual" : schedulerLabel}</dd>
        </div>
        {!isLocalRuntime ? (
          <div>
            <dt>Pembaruan berikutnya</dt>
            <dd>{nextExpectedAt ? formatWib(nextExpectedAt) : "Menunggu scheduler VPS"}</dd>
          </div>
        ) : null}
      </dl>
      {!isLocalRuntime && lastAttempt?.mailStatus === "success" ? (
        <p className="email-account__count">
          {lastAttempt.mailCount.toLocaleString("id-ID")} email baru pada sync terakhir
        </p>
      ) : null}
    </section>
  );
}

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
    draft?: string;
    messageBefore?: string;
    status?: string;
  }>;
}) {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role)) redirect("/admin");
  const database = getDatabase();
  const [mailConnection] = database
    ? await database
        .select({
          secretCiphertext: integrations.secretCiphertext,
          lastError: integrations.lastError,
          lastSyncAt: integrations.lastSyncAt,
          metadata: integrations.metadata,
        })
        .from(integrations)
        .where(eq(integrations.key, "cs-mail"))
        .limit(1)
    : [];
  if (!database)
    return (
      <section className="admin-page email-page">
        <h1>Email CS</h1>
        <p role="alert">Database belum tersedia. Coba lagi setelah layanan pulih.</p>
      </section>
    );
  const params = await searchParams;
  const [recentSyncRuns, lastScheduledRunAt, activeRun] = await Promise.all([
    getRecentIntegrationSyncRuns(),
    getLastScheduledIntegrationRun("mail"),
    getActiveIntegrationSyncRun("mail"),
  ]);
  const latestMailRun = recentSyncRuns.find((run) => run.mailStatus !== "skipped") ?? null;
  const isLocalRuntime = process.env.NODE_ENV !== "production";
  const mailMetadata = (mailConnection?.metadata ?? {}) as Record<string, unknown>;
  const mailHealth = getIntegrationHealth({
    configured: Boolean(mailConnection?.secretCiphertext),
    configurationReady: hasIntegrationEncryptionKey(),
    lastError: mailConnection?.lastError?.startsWith("Isi email belum dapat diambil")
      ? null
      : mailConnection?.lastError,
    lastErrorCode: typeof mailMetadata.mailLastErrorCode === "string" ? mailMetadata.mailLastErrorCode : null,
    lastSyncAt: mailConnection?.lastSyncAt,
    staleAfterHours: INTEGRATION_HEALTH_STALE_HOURS.mail,
  });
  const schedulerHealth = getSchedulerHealth(lastScheduledRunAt);
  const schedulerConfiguration = getSchedulerConfiguration();
  let mailboxAddress: string | null = null;
  if (mailConnection?.secretCiphertext) {
    try {
      const settings = decryptSecret<MailSettings>(mailConnection.secretCiphertext);
      mailboxAddress = typeof settings.email === "string" ? settings.email.trim() || null : null;
    } catch {
      // Keep the archive available when the private configuration cannot be read.
    }
  }
  const mailboxHealth = getMailboxOperationalHealth({
    connection: mailHealth,
    scheduler: schedulerHealth,
    schedulerLastRunAt: lastScheduledRunAt,
    lastSyncAt: mailConnection?.lastSyncAt ?? null,
    lastErrorCode: typeof mailMetadata.mailLastErrorCode === "string" ? mailMetadata.mailLastErrorCode : null,
    isLocalRuntime,
    schedulerConfigured: schedulerConfiguration.configured,
    isRunning: activeRun?.trigger === "scheduled",
  });
  const accountIdentity = (
    <EmailAccount
      address={mailboxAddress}
      health={mailboxHealth}
      nextExpectedAt={mailboxHealth.nextExpectedAt}
      isLocalRuntime={isLocalRuntime}
      lastAttempt={latestMailRun}
      lastSyncAt={mailConnection?.lastSyncAt}
      schedulerLabel={schedulerConfiguration.configured ? schedulerHealth.label : "Belum dikonfigurasi"}
    />
  );
  if (params.folder === "drafts" || params.draft) {
    const [drafts, selected] = await Promise.all([
      listDrafts(params.before),
      params.draft ? readDraft(params.draft) : null,
    ]);
    return (
      <section className="admin-page email-page">
        {!selected ? (
          <EmailListScrollRestorer
            listUrl={`/admin/email?folder=drafts${params.before ? `&before=${encodeURIComponent(params.before)}` : ""}`}
          />
        ) : null}
        <AdminPageHeader
          title="Email CS"
          description="Draf privat untuk pemilik dan administrator."
          actions={
            <form action={startEmailDraft}>
              <button className="admin-primary-button">Tulis email</button>
            </form>
          }
        />
        {accountIdentity}
        <nav className="email-tabs" aria-label="Bagian email">
          <Link href="/admin/email?folder=inbox">Kotak masuk</Link>
          <Link href="/admin/email?folder=sent">Terkirim</Link>
          <Link aria-current="page" href="/admin/email?folder=drafts">
            Draf
          </Link>
        </nav>
        <div className={`email-workspace ${selected ? "email-workspace--detail" : "email-workspace--list"}`}>
          <aside className="email-list" aria-label="Daftar draf">
            {drafts.items.length ? (
              drafts.items.map((item) => (
                <EmailResultLink
                  returnTo={`/admin/email?folder=drafts${params.before ? `&before=${encodeURIComponent(params.before)}` : ""}`}
                  key={item.id}
                  className="email-list-item"
                  aria-current={selected?.id === item.id ? "true" : undefined}
                  href={`/admin/email?folder=drafts${params.before ? `&before=${encodeURIComponent(params.before)}` : ""}&draft=${item.id}`}
                >
                  <span className="email-list-item__top">
                    <strong>{item.subject}</strong>
                    <time>
                      {new Date(item.updatedAt).toLocaleDateString("id-ID", {
                        timeZone: "Asia/Jakarta",
                        day: "numeric",
                        month: "short",
                      })}
                    </time>
                  </span>
                  <span>{item.to || "Penerima belum diisi"}</span>
                  <small>{item.ownerId === user.id ? "Draf Anda" : "Draf anggota tim"}</small>
                </EmailResultLink>
              ))
            ) : (
              <div className="email-empty">
                <strong>Belum ada draf</strong>
                <span>Mulai pesan baru; perubahan akan disimpan otomatis.</span>
              </div>
            )}
            {drafts.next ? (
              <Link
                className="email-next-page"
                href={`/admin/email?folder=drafts&before=${encodeURIComponent(drafts.next)}`}
              >
                Muat draf sebelumnya
              </Link>
            ) : null}
          </aside>
          {selected ? (
            <EmailDetailDrawer
              closeHref={`/admin/email?folder=drafts${params.before ? `&before=${encodeURIComponent(params.before)}` : ""}`}
              label="Detail draf email"
            >
              <article className="email-detail">
                <p className="email-composer-sender">
                  Dari: <strong>{mailboxAddress ?? "Alamat email belum tersedia"}</strong>
                </p>
                <EmailDraftComposer key={selected.id} initial={selected} currentUserId={user.id} />
              </article>
            </EmailDetailDrawer>
          ) : (
            <article className="email-detail">
              <div className="email-detail-empty">
                <h2>Pilih draf untuk melanjutkan</h2>
                <p>Draf tidak dikirim sampai Anda mengonfirmasi pratinjau terakhir.</p>
              </div>
            </article>
          )}
          <EmailSelectionLoading />
        </div>
      </section>
    );
  }
  const folder = params.folder === "sent" ? "sent" : "inbox";
  const listParams = new URLSearchParams({ folder });
  if (params.q) listParams.set("q", params.q);
  if (params.before) listParams.set("before", params.before);
  if (params.status) listParams.set("status", params.status);
  const listUrl = `/admin/email?${listParams}`;
  const listing = await listConversations(
    folder,
    params.before,
    params.q,
    folder === "sent" ? params.status : undefined,
  );
  if (listing === null)
    return (
      <section className="admin-page">
        <h1>Email CS</h1>
        <p>Database belum tersedia.</p>
      </section>
    );
  const picked = params.email
    ? params.email.startsWith("outbox:")
      ? await getOutboxRecord(params.email.slice(7))
      : folder === "inbox" || params.email.startsWith("mailbox:")
        ? await getEmailRecord(params.email.replace(/^mailbox:/, ""))
        : await getOutboxRecord(params.email.replace(/^outbox:/, ""))
    : null;
  const selectedId = picked ? ("uid" in picked ? `mailbox:${picked.id}` : `outbox:${picked.id}`) : "";
  const conversation = selectedId ? await conversationMessages(selectedId, params.messageBefore) : null;
  const sender = picked && "uid" in picked ? (picked.fromAddress ?? "") : "Anugrah Plastik";
  const recipient = picked && "uid" in picked ? (picked.toAddress ?? "") : (picked?.toAddress ?? "");
  const subject = picked?.subject ?? "";
  const emailRow = picked && "uid" in picked ? picked : null;
  return (
    <section className="admin-page email-page">
      {!picked && !params.compose ? <EmailListScrollRestorer listUrl={listUrl} /> : null}
      <AdminPageHeader
        title="Email CS"
        description="Baca pesan pelanggan dan kelola balasan dari alamat resmi Anugrah Plastik."
        actions={
          <>
            <MailboxRefreshControl returnTo={listUrl} />
            <form action={startEmailDraft}>
              <button className="admin-primary-button" type="submit">
                Tulis email
              </button>
            </form>
          </>
        }
      />
      {accountIdentity}
      {params.synced ? (
        <p className="integration-success" role="status">
          Kotak email berhasil diperiksa.
        </p>
      ) : null}
      {params.sync === "error" ? (
        <p className="integration-alert" role="alert">
          {mailboxHealth.label}. {mailboxHealth.recovery} Pesan yang sudah tersimpan tetap dapat dibuka.
        </p>
      ) : null}
      {!mailConnection?.secretCiphertext ? (
        <p className="integration-alert" role="status">
          Email CS belum tersambung. Arsip dan draf tetap tersedia;{" "}
          {user.role === "admin" ? (
            <Link href="/admin/settings/integrations">siapkan koneksi email</Link>
          ) : (
            "minta administrator menyiapkan koneksi"
          )}
          .
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
        <Link href="/admin/email?folder=drafts">Draf</Link>
        <Link aria-current={folder === "sent" ? "page" : undefined} href="/admin/email?folder=sent">
          Terkirim
        </Link>
      </div>
      <form className="email-search" method="get">
        <input type="hidden" name="folder" value={folder} />
        <input aria-label="Cari email" name="q" placeholder="Cari pengirim atau subjek" defaultValue={params.q} />
        {folder === "sent" ? (
          <select name="status" aria-label="Status pengiriman" defaultValue={params.status ?? ""}>
            <option value="">Semua status</option>
            {["sent", "partial", "failed", "uncertain", "pending", "simulated"].map((status) => (
              <option key={status} value={status}>
                {outgoingStatusLabel(status)}
              </option>
            ))}
          </select>
        ) : null}
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
              <EmailResultLink
                returnTo={listUrl}
                className="email-list-item"
                aria-current={selectedId === item.id ? "true" : undefined}
                href={`${listUrl}&email=${item.id}`}
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
                      ? new Date(item.receivedAt).toLocaleDateString("id-ID", {
                          timeZone: "Asia/Jakarta",
                          day: "numeric",
                          month: "short",
                        })
                      : "Belum tersedia"}
                  </time>
                </span>
                <span>{item.subject}</span>
                <small>
                  {item.count > 1 ? `${item.count} pesan · ` : ""}
                  {folder === "inbox"
                    ? item.fromAddress
                    : "source" in item && item.source === "mailbox"
                      ? "Terkirim dari mailbox"
                      : outgoingStatusLabel(item.status)}
                </small>
              </EmailResultLink>
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
              href={`/admin/email?folder=${folder}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}${params.status ? `&status=${encodeURIComponent(params.status)}` : ""}&before=${encodeURIComponent(listing.next)}`}
            >
              Muat email sebelumnya
            </Link>
          ) : null}
        </aside>
        {picked || params.compose ? (
          <EmailDetailDrawer closeHref={listUrl} label={params.compose ? "Tulis email" : "Detail email"}>
            <article className="email-detail">
              {params.compose ? (
                <>
                  <p className="admin-eyebrow">PESAN BARU</p>
                  <h2>Tulis email</h2>
                  <p>Mulai draf untuk menyimpan perubahan dan memeriksa penerima sebelum mengirim.</p>
                  <form action={startEmailDraft}>
                    <button className="admin-primary-button" type="submit">
                      Mulai draf email
                    </button>
                  </form>
                </>
              ) : picked ? (
                <>
                  <p className="admin-eyebrow">{folder === "inbox" ? "EMAIL MASUK" : "EMAIL TERKIRIM"}</p>
                  <h2>{subject}</h2>
                  {picked && !("uid" in picked) ? (
                    <p className="email-linked-note" role="status">
                      {outgoingStatusLabel(picked.status)}.
                      {picked.linkedTransactionId ? (
                        <>
                          {" "}
                          <Link href={`/admin/transactions/${picked.linkedTransactionId}`}>
                            Lihat transaksi terkait
                          </Link>
                          .
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  {conversation && conversation.items.length > 1 ? (
                    <details className="email-thread-history">
                      <summary>{conversation.items.length} pesan pada percakapan ini</summary>
                      <div>
                        {conversation.items.map((item) => (
                          <Link
                            key={item.id}
                            href={`/admin/email?folder=${folder}&email=${encodeURIComponent(item.id)}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}${params.before ? `&before=${encodeURIComponent(params.before)}` : ""}`}
                            aria-current={item.id === selectedId ? "true" : undefined}
                          >
                            <strong>{item.subject}</strong>
                            <span>
                              {item.fromName || item.fromAddress || "Anugrah Plastik"} ·{" "}
                              {new Date(item.receivedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
                            </span>
                          </Link>
                        ))}
                      </div>
                      {conversation.hasMore ? (
                        <Link
                          href={`/admin/email?folder=${folder}&email=${encodeURIComponent(params.email ?? "")}&messageBefore=${encodeURIComponent(conversation.next ?? "")}`}
                        >
                          Muat pesan sebelumnya
                        </Link>
                      ) : null}
                    </details>
                  ) : null}
                  <div className="email-meta">
                    <span>Dari</span>
                    <strong>{sender || "Belum tersedia"}</strong>
                    <span>Kepada</span>
                    <strong>{recipient || "Belum tersedia"}</strong>
                    <span>Waktu</span>
                    <strong>
                      {emailRow?.receivedAt
                        ? new Date(emailRow.receivedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
                        : picked && "sentAt" in picked
                          ? new Date(picked.startedAt ?? picked.sentAt).toLocaleString("id-ID", {
                              timeZone: "Asia/Jakarta",
                            })
                          : "Belum tersedia"}
                    </strong>
                  </div>
                  <Suspense fallback={<EmailDetailShimmer label="Memuat isi email" />}>
                    <EmailMessageContent picked={picked} />
                  </Suspense>
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
                          <EmailTransactionPicker key={emailRow.id} emailId={emailRow.id} />
                        </details>
                      )}
                      <div className="email-composer-actions">
                        <form action={startEmailDraft}>
                          <input type="hidden" name="replyToId" value={emailRow.id} />
                          <button className="admin-primary-button" type="submit">
                            Balas email
                          </button>
                        </form>
                        <form action={startEmailDraft}>
                          <input type="hidden" name="replyToId" value={emailRow.id} />
                          <input type="hidden" name="all" value="1" />
                          <button className="admin-secondary-button" type="submit">
                            Balas semua
                          </button>
                        </form>
                      </div>
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
          </EmailDetailDrawer>
        ) : (
          <article className="email-detail">
            <div className="email-detail-empty">
              <span aria-hidden="true">✉</span>
              <h2>Pilih email</h2>
              <p>Isi email tampil di sini. Lampiran tidak diunduh atau disimpan otomatis.</p>
            </div>
          </article>
        )}
        <EmailSelectionLoading />
      </div>
    </section>
  );
}
