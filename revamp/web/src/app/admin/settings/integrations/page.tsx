import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { startGoogleAdsConnection } from "@/features/integrations/actions";
import { IntegrationHealthControls } from "@/components/integrations/integration-health-controls";
import {
  INTEGRATION_HEALTH_STALE_HOURS,
  getIntegrationHealth,
  getSchedulerHealth,
} from "@/features/integrations/integration-health";
import {
  getActiveIntegrationSyncRun,
  getSchedulerConfiguration,
  getLastScheduledIntegrationRun,
  getRecentIntegrationSyncRuns,
} from "@/features/integrations/sync-runner";
import { getMailboxOperationalHealth } from "@/features/integrations/mailbox-operational-health";
import { getCsMailboxServerConfig } from "@/features/integrations/mailbox-config";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { integrations } from "@/lib/database/schema";
import { hasIntegrationEncryptionKey } from "@/features/integrations/secrets";
import {
  getGoogleAdsOAuthConfigurationIssues,
  getGoogleAdsReportingConfigurationIssues,
  googleAdsCustomerId,
  googleAdsLoginCustomerId,
  googleAdsRedirectUri,
  isGoogleAdsOAuthConfigured,
  isGoogleAdsReportingConfigured,
  maskGoogleAdsCustomerId,
} from "@/features/integrations/google-ads-config";
import { MailboxSetupForm } from "@/components/integrations/mailbox-setup-form";
import { redirect } from "next/navigation";

export const instant = false;

const RUN_STATUS_LABEL: Record<string, string> = {
  success: "Berhasil",
  failed: "Gagal",
  skipped: "Dilewati",
  busy: "Sedang berjalan di proses lain",
  "not-due": "Belum dijadwalkan",
  "retry-exhausted": "Retry hari ini habis",
  running: "Sedang berjalan",
};

function formatWib(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB" : "Belum ada";
}

function lastRunFor(
  runs: { startedAt: Date; mailStatus: string; adsStatus: string; mailCount: number; adsCount: number }[],
  service: "mail" | "ads",
) {
  return runs.find((run) => (service === "mail" ? run.mailStatus : run.adsStatus) !== "skipped") ?? null;
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role)) redirect("/admin");
  const canManage = user.role === "admin";
  const database = getDatabase();
  const all = database ? await database.select().from(integrations) : [];
  const mail = all.find((item) => item.key === "cs-mail");
  const ads = all.find((item) => item.key === "google-ads");
  const mailConfigured = Boolean(mail?.secretCiphertext);
  const mailServer = getCsMailboxServerConfig();
  const adsConfigured = Boolean(ads?.secretCiphertext);
  const params = await searchParams;
  const encryptionReady = hasIntegrationEncryptionKey();
  const googleConfigured = isGoogleAdsOAuthConfigured();
  const googleOAuthIssues = getGoogleAdsOAuthConfigurationIssues();
  const googleReportingReady = isGoogleAdsReportingConfigured();
  const googleReportingIssues = getGoogleAdsReportingConfigurationIssues();
  const googleActionIssues = [...googleOAuthIssues, ...googleReportingIssues];
  const googleActionIssueLabels = googleActionIssues.map((issue) => issue.label);
  const isLocalRuntime = process.env.NODE_ENV !== "production";
  const callbackHost = new URL(googleAdsRedirectUri()).hostname;
  const localCallbackReady = process.env.NODE_ENV === "production" || ["localhost", "127.0.0.1"].includes(callbackHost);
  const googleReady = googleConfigured && googleOAuthIssues.length === 0 && localCallbackReady;
  const [recentRuns, lastMailScheduledRunAt, lastAdsScheduledRunAt, activeMailRun, activeAdsRun] = await Promise.all([
    getRecentIntegrationSyncRuns(),
    getLastScheduledIntegrationRun("mail"),
    getLastScheduledIntegrationRun("ads"),
    getActiveIntegrationSyncRun("mail"),
    getActiveIntegrationSyncRun("ads"),
  ]);
  const latestMailRun = lastRunFor(recentRuns, "mail");
  const latestAdsRun = lastRunFor(recentRuns, "ads");
  const localLastSuccessfulSync = [mail?.lastSyncAt, ads?.lastSyncAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const mailSchedulerHealth = getSchedulerHealth(lastMailScheduledRunAt);
  const adsSchedulerHealth = getSchedulerHealth(lastAdsScheduledRunAt, new Date(), 45);
  const schedulerConfiguration = getSchedulerConfiguration();
  const adsMetadata = (ads?.metadata ?? {}) as Record<string, unknown>;
  const mailMetadata = (mail?.metadata ?? {}) as Record<string, unknown>;
  const adsRetryCount = Math.min(Math.max(Number(adsMetadata.adsAutoFailureCount) || 0, 0), 3);
  // Older versions incorrectly saved a single message-body fetch error as the
  // mailbox-wide integration error. It should not make Email CS appear disconnected.
  const mailLastError = mail?.lastError?.startsWith("Isi email belum dapat diambil") ? null : mail?.lastError;
  const adsHealth = getIntegrationHealth({
    configured: adsConfigured,
    configurationReady: googleReady && googleReportingReady,
    lastError: ads?.lastError,
    lastErrorCode: typeof adsMetadata.lastErrorCode === "string" ? adsMetadata.lastErrorCode : null,
    lastSyncAt: ads?.lastSyncAt,
    staleAfterHours: INTEGRATION_HEALTH_STALE_HOURS.googleAds,
  });
  const mailHealth = getIntegrationHealth({
    configured: mailConfigured,
    configurationReady: encryptionReady,
    lastError: mailLastError,
    lastErrorCode: typeof mailMetadata.mailLastErrorCode === "string" ? mailMetadata.mailLastErrorCode : null,
    lastSyncAt: mail?.lastSyncAt,
    staleAfterHours: INTEGRATION_HEALTH_STALE_HOURS.mail,
  });
  const mailboxHealth = getMailboxOperationalHealth({
    connection: mailHealth,
    scheduler: mailSchedulerHealth,
    schedulerLastRunAt: lastMailScheduledRunAt,
    lastSyncAt: mail?.lastSyncAt ?? null,
    lastErrorCode: typeof mailMetadata.mailLastErrorCode === "string" ? mailMetadata.mailLastErrorCode : null,
    isLocalRuntime,
    schedulerConfigured: schedulerConfiguration.configured,
    isRunning: activeMailRun?.trigger === "scheduled",
  });
  const mailConnectionStatus = !mailConfigured
    ? "Belum disambungkan"
    : mailboxHealth.label === "Email siap digunakan"
      ? "Tersambung dan sehat"
      : isLocalRuntime && mailboxHealth.label === "Data diperbarui manual"
        ? "Kredensial tersimpan. Perbarui secara manual."
        : "Kredensial tersimpan, koneksi belum sehat";
  const mailRecovery =
    isLocalRuntime && mailMetadata.mailLastErrorCode === "mail_timeout"
      ? "Komputer lokal tidak dapat menjangkau IMAP 993 dan SMTP 465. Ini bukan bukti kata sandi salah. Tidak ada percobaan otomatis di mode lokal; periksa firewall atau layanan mailbox, lalu pilih Uji ulang koneksi."
      : mailboxHealth.recovery;
  const errorMessages: Record<string, string> = {
    "google-cancelled": "Proses sambung Google Ads dibatalkan.",
    "google-state": "Sesi sambung Google Ads kedaluwarsa. Silakan ulangi.",
    "google-config": "Pengaturan OAuth belum lengkap di server.",
    "google-token": "Google Ads belum memberikan token yang valid. Periksa OAuth Client.",
    "google-token-scope": "Akses laporan Google Ads belum disetujui.",
    "google-account": "Pilih akun Google Ads yang sudah diberi akses: razornez@gmail.com.",
    "google-local":
      "Callback OAuth lokal harus menggunakan localhost agar sesi persetujuan dan callback memakai database lokal yang sama.",
  };
  return (
    <section className="admin-page integration-page">
      <AdminPageHeader
        title="Integrasi"
        description="Kelola koneksi Email CS dan Google Ads untuk ruang kerja."
        back={{ href: "/admin", label: "Kembali ke beranda" }}
        actions={
          canManage ? (
            <Link className="admin-secondary-button" href="/admin/settings/invoice">
              Pengaturan invoice
            </Link>
          ) : null
        }
      />
      {params.error ? (
        <p className="integration-alert" role="alert">
          {errorMessages[params.error] ?? "Koneksi belum berhasil. Silakan coba lagi."}
        </p>
      ) : null}
      {params.saved ? (
        <p className="integration-success" role="status">
          Koneksi berhasil disimpan dan siap digunakan.
        </p>
      ) : null}
      <section
        className={`integration-runner-health is-${isLocalRuntime || !schedulerConfiguration.configured ? "needs-test" : mailSchedulerHealth.level === "attention" || adsSchedulerHealth.level === "attention" ? "attention" : mailSchedulerHealth.level === "healthy" && adsSchedulerHealth.level === "healthy" ? "healthy" : "needs-test"}`}
        aria-label={isLocalRuntime ? "Mode sinkronisasi lokal" : "Status scheduler VPS"}
      >
        <div>
          <p className="admin-eyebrow">{isLocalRuntime ? "MODE LOKAL" : "SINKRONISASI VPS"}</p>
          <h2>
            {isLocalRuntime
              ? "Pembaruan manual"
              : !schedulerConfiguration.configured
                ? "Scheduler belum siap"
                : mailSchedulerHealth.level === "healthy" && adsSchedulerHealth.level === "healthy"
                  ? "Scheduler aktif"
                  : "Scheduler perlu perhatian"}
          </h2>
          <p>
            {isLocalRuntime
              ? "Tidak ada scheduler atau koneksi mailbox permanen di komputer ini. Gunakan tindakan perbarui untuk menguji dan mengambil data terbaru."
              : !schedulerConfiguration.configured
                ? schedulerConfiguration.issues.join(" · ")
                : `Email: ${mailSchedulerHealth.summary} Google Ads: ${adsSchedulerHealth.summary}`}
          </p>
        </div>
        <div>
          <span>{isLocalRuntime ? "Sync berhasil terakhir" : "Heartbeat provider"}</span>
          <strong>
            {isLocalRuntime
              ? formatWib(localLastSuccessfulSync)
              : `Email ${formatWib(lastMailScheduledRunAt)} · Ads ${formatWib(lastAdsScheduledRunAt)}`}
          </strong>
          <small>
            {isLocalRuntime
              ? "Status provider berubah hanya setelah pemeriksaan manual."
              : "Email setiap 5 menit · Google Ads diperiksa setiap 15 menit"}
          </small>
        </div>
      </section>
      <div className="integration-grid">
        <article className="integration-card">
          <div className="integration-card__heading">
            <div>
              <span className="integration-mark">G</span>
              <div>
                <h2>Google Ads</h2>
                <p>Laporan performa kampanye, hanya-baca</p>
              </div>
            </div>
            <span className={`integration-status is-${adsHealth.level}`}>{adsHealth.label}</span>
          </div>
          <div className="integration-facts">
            <span>Akun</span>
            <strong>Anugrah Plastik · {maskGoogleAdsCustomerId(googleAdsCustomerId())}</strong>
            <span>MCC laporan</span>
            <strong>{maskGoogleAdsCustomerId(googleAdsLoginCustomerId())}</strong>
            <span>Data</span>
            <strong>Impresi, klik, biaya, konversi, dan status kampanye</strong>
            <span>Data terakhir diperbarui</span>
            <strong>{formatWib(ads?.lastSyncAt)}</strong>
            <span>Pemeriksaan terakhir</span>
            <strong>
              {latestAdsRun
                ? `${formatWib(latestAdsRun.startedAt)} · ${RUN_STATUS_LABEL[latestAdsRun.adsStatus] ?? latestAdsRun.adsStatus}`
                : "Belum ada percobaan tercatat"}
            </strong>
            {latestAdsRun?.adsStatus === "success" ? (
              <>
                <span>Baris laporan terakhir</span>
                <strong>{latestAdsRun.adsCount.toLocaleString("id-ID")}</strong>
              </>
            ) : null}
            <span>Hasil terakhir</span>
            <strong>{adsHealth.summary}</strong>
            {!isLocalRuntime ? (
              <>
                <span>Scheduler Google Ads</span>
                <strong>{activeAdsRun ? "Sedang berjalan" : adsSchedulerHealth.label}</strong>
              </>
            ) : null}
            {adsRetryCount ? (
              <>
                <span>Retry laporan hari ini</span>
                <strong>{adsRetryCount} dari 3 upaya telah digunakan</strong>
              </>
            ) : null}
          </div>
          <p className={`integration-health-note is-${adsHealth.level}`}>{adsHealth.recovery}</p>
          {canManage && (!adsConfigured || adsHealth.level === "reconnect") ? (
            <>
              <form action={startGoogleAdsConnection}>
                <button className="admin-primary-button" type="submit" disabled={!googleReady}>
                  {adsConfigured ? "Sambungkan ulang akun" : "Sambungkan Google Ads"}
                </button>
              </form>
              <p className="integration-note">
                Google dapat meminta login, persetujuan, atau passkey. Verifikasi tersebut dikendalikan Google Account
                dan tidak disimpan aplikasi ini.
              </p>
            </>
          ) : null}
          {!googleReady ? (
            <p className="integration-note">
              {!googleConfigured || googleOAuthIssues.length
                ? `Belum siap disambungkan: ${googleOAuthIssues.map((issue) => issue.label).join(" dan ") || "OAuth Client"} belum diatur pada server. Jangan masukkan rahasia ke chat; konfigurasi hanya di environment server.`
                : "Callback saat ini bukan localhost. Atur callback lokal sebelum memulai sambungan dari aplikasi ini."}
            </p>
          ) : null}
          {googleReady && !googleReportingReady ? (
            <div className="integration-note" role="status">
              <strong>Laporan belum siap ditarik.</strong>
              <p>Lengkapi di environment privat server, lalu restart aplikasi:</p>
              <ul>
                {googleReportingIssues.map((issue) => (
                  <li key={issue.code}>
                    <strong>{issue.label}:</strong> {issue.recovery}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {adsConfigured && canManage ? (
            <IntegrationHealthControls
              connected
              kind="google-ads"
              unavailableReason={
                googleReady && googleReportingReady
                  ? undefined
                  : `Lengkapi ${googleActionIssueLabels.join(" dan ")} terlebih dahulu.`
              }
            />
          ) : null}
          {!adsConfigured ? (
            <p className="integration-note">
              Google Cloud OAuth, akses project ke Google Ads API, dan izin laporan perlu disiapkan lebih dulu.
            </p>
          ) : null}
          {!canManage ? (
            <p className="integration-note">
              Status dapat dilihat oleh sales; tindakan koneksi hanya untuk administrator.
            </p>
          ) : null}
        </article>
        <article className="integration-card">
          <div className="integration-card__heading">
            <div>
              <span className="integration-mark integration-mark--mail">@</span>
              <div>
                <h2>Email CS</h2>
                <p>Kotak masuk, balasan pelanggan, dan surat terkirim</p>
              </div>
            </div>
            <span className={`integration-status is-${mailboxHealth.level}`}>{mailboxHealth.label}</span>
          </div>
          <div className="integration-facts">
            <span>Status koneksi</span>
            <strong>{mailConnectionStatus}</strong>
            <span>Alamat</span>
            <strong>cs@anugrahplastik.com</strong>
            <span>Endpoint mailbox</span>
            <strong>
              {mailServer.host} · IMAP {mailServer.imapPort} · SMTP {mailServer.smtpPort}
            </strong>
            {!mailServer.configuredExplicitly ? (
              <>
                <span>Konfigurasi endpoint</span>
                <strong>Belum diatur. Gunakan hostname dari cPanel Set Up Mail Client.</strong>
              </>
            ) : null}
            <span>Data terakhir diperbarui</span>
            <strong>{formatWib(mail?.lastSyncAt)}</strong>
            <span>Pemeriksaan terakhir</span>
            <strong>
              {latestMailRun
                ? `${formatWib(latestMailRun.startedAt)} · ${RUN_STATUS_LABEL[latestMailRun.mailStatus] ?? latestMailRun.mailStatus}`
                : "Belum ada percobaan tercatat"}
            </strong>
            {latestMailRun?.mailStatus === "success" ? (
              <>
                <span>Email baru pada sync terakhir</span>
                <strong>{latestMailRun.mailCount.toLocaleString("id-ID")}</strong>
              </>
            ) : null}
            <span>Hasil terakhir</span>
            <strong>{mailboxHealth.summary}</strong>
          </div>
          {!isLocalRuntime ? (
            <p className="integration-note">
              Pembaruan berikutnya:{" "}
              {mailboxHealth.nextExpectedAt ? formatWib(mailboxHealth.nextExpectedAt) : "menunggu scheduler VPS"}
            </p>
          ) : null}
          <p className={`integration-health-note is-${mailboxHealth.level}`}>{mailRecovery}</p>
          {canManage ? <MailboxSetupForm encryptionReady={encryptionReady} connected={mailConfigured} /> : null}
          {mailConfigured ? (
            <>
              <Link className="admin-secondary-button" href="/admin/email">
                Buka Email CS
              </Link>
              {canManage ? <IntegrationHealthControls connected kind="mail" /> : null}
            </>
          ) : null}
        </article>
      </div>
      <section className="integration-run-history" aria-labelledby="integration-run-history-title">
        <div className="integration-run-history__heading">
          <div>
            <p className="admin-eyebrow">RIWAYAT OPERASIONAL</p>
            <h2 id="integration-run-history-title">Eksekusi sinkronisasi terbaru</h2>
          </div>
          <span>Hanya metadata aman · 30 hari</span>
        </div>
        {recentRuns.length ? (
          <div className="integration-run-history__rows">
            {recentRuns.map((run) => (
              <article key={run.id}>
                <time>{new Date(run.startedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</time>
                <strong>{run.trigger === "scheduled" ? "Scheduler VPS" : "Pemeriksaan manual"}</strong>
                <span className={`integration-run-badge is-${run.mailStatus}`}>
                  Email: {RUN_STATUS_LABEL[run.mailStatus] ?? run.mailStatus}
                </span>
                <span className={`integration-run-badge is-${run.adsStatus}`}>
                  Google Ads: {RUN_STATUS_LABEL[run.adsStatus] ?? run.adsStatus}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="integration-note">
            Belum ada riwayat. Scheduler akan mengisinya setelah konfigurasi VPS diaktifkan.
          </p>
        )}
      </section>
    </section>
  );
}
