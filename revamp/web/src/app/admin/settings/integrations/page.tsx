import Link from "next/link";
import { disconnectCsMailbox, disconnectGoogleAds, startGoogleAdsConnection } from "@/features/integrations/actions";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { integrations } from "@/lib/database/schema";
import { hasIntegrationEncryptionKey } from "@/features/integrations/secrets";
import { googleAdsRedirectUri, isGoogleAdsOAuthConfigured } from "@/features/integrations/google-ads-config";
import { MailboxSetupForm } from "@/components/integrations/mailbox-setup-form";
import { redirect } from "next/navigation";

export const instant = false;

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const database = getDatabase();
  const all = database ? await database.select().from(integrations) : [];
  const mail = all.find((item) => item.key === "cs-mail");
  const ads = all.find((item) => item.key === "google-ads");
  const mailConfigured = Boolean(mail?.secretCiphertext);
  const adsConfigured = Boolean(ads?.secretCiphertext);
  const params = await searchParams;
  const encryptionReady = hasIntegrationEncryptionKey();
  const googleConfigured = isGoogleAdsOAuthConfigured();
  const callbackHost = new URL(googleAdsRedirectUri()).hostname;
  const localCallbackReady = process.env.NODE_ENV === "production" || ["localhost", "127.0.0.1"].includes(callbackHost);
  const googleReady = googleConfigured && localCallbackReady;
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
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">PENGATURAN</p>
          <h1>Koneksi layanan</h1>
          <p>Sambungkan akun iklan dan email layanan pelanggan untuk dipakai di ruang kerja.</p>
        </div>
        <Link className="admin-secondary-button" href="/admin">
          Kembali ke beranda
        </Link>
      </div>
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
            <span
              className={`integration-status is-${adsConfigured ? (ads?.lastError ? "error" : "connected") : "disconnected"}`}
            >
              {adsConfigured ? (ads?.lastError ? "Tersambung · Perlu perhatian" : "Tersambung") : "Belum tersambung"}
            </span>
          </div>
          <div className="integration-facts">
            <span>Akun</span>
            <strong>Anugrah Plastik · {process.env.GOOGLE_ADS_CUSTOMER_ID || "673-889-5829"}</strong>
            <span>Data</span>
            <strong>Impresi, klik, biaya, konversi, dan status kampanye</strong>
            {ads?.lastSyncAt ? (
              <>
                <span>Pembaruan terakhir</span>
                <strong>{new Date(ads.lastSyncAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</strong>
              </>
            ) : null}
          </div>
          {ads?.lastError ? <p className="integration-alert">{ads.lastError}</p> : null}
          <form action={startGoogleAdsConnection}>
            <button className="admin-primary-button" type="submit" disabled={!googleReady}>
              {adsConfigured ? "Sambungkan ulang akun" : "Sambungkan Google Ads"}
            </button>
          </form>
          {!googleReady ? (
            <p className="integration-note">
              {!googleConfigured
                ? "Belum siap disambungkan: OAuth Client ID dan Client Secret belum diatur pada server lokal. Jangan masukkan rahasia ke chat; konfigurasi hanya di environment server."
                : "Callback saat ini bukan localhost. Atur callback lokal sebelum memulai sambungan dari aplikasi ini."}
            </p>
          ) : null}
          {adsConfigured ? (
            <form action={disconnectGoogleAds}>
              <button className="admin-link-button" type="submit">
                Putuskan koneksi
              </button>
            </form>
          ) : (
            <p className="integration-note">
              Google Cloud OAuth, akses project ke Google Ads API, dan izin laporan perlu disiapkan lebih dulu.
            </p>
          )}
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
            <span
              className={`integration-status is-${mailConfigured ? (mail?.lastError ? "error" : "connected") : "disconnected"}`}
            >
              {mailConfigured ? (mail?.lastError ? "Tersambung · Perlu perhatian" : "Tersambung") : "Belum tersambung"}
            </span>
          </div>
          <div className="integration-facts">
            <span>Alamat</span>
            <strong>cs@anugrahplastik.com</strong>
            <span>Server aman</span>
            <strong>mail.anugrahplastik.com · IMAP 993 · SMTP 465</strong>
            {mail?.lastSyncAt ? (
              <>
                <span>Sinkron terakhir</span>
                <strong>{new Date(mail.lastSyncAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</strong>
              </>
            ) : null}
          </div>
          {mail?.lastError ? (
            <p className="integration-alert">
              Koneksi email perlu diperiksa. Kata sandi atau akses mailbox mungkin berubah.
            </p>
          ) : null}
          <MailboxSetupForm encryptionReady={encryptionReady} connected={mailConfigured} />
          {mailConfigured ? (
            <>
              <Link className="admin-secondary-button" href="/admin/email">
                Buka Email CS
              </Link>
              <form action={disconnectCsMailbox}>
                <button className="admin-link-button" type="submit">
                  Putuskan koneksi
                </button>
              </form>
            </>
          ) : null}
        </article>
      </div>
    </section>
  );
}
