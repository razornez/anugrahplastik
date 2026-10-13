export type IntegrationHealthLevel = "not-ready" | "needs-test" | "healthy" | "attention" | "reconnect";

export type IntegrationHealth = {
  level: IntegrationHealthLevel;
  label: string;
  summary: string;
  recovery: string;
  lastCheckedAt: Date | null;
};

type IntegrationHealthInput = {
  configured: boolean;
  configurationReady: boolean;
  lastSyncAt?: Date | null;
  lastError?: string | null;
  lastErrorCode?: string | null;
  staleAfterHours: number;
  now?: Date;
};

/**
 * A connection is not considered healthy merely because an encrypted secret exists.
 * The same definition is shared by the settings, email, and marketing workspaces.
 */
export function getIntegrationHealth({
  configured,
  configurationReady,
  lastSyncAt = null,
  lastError = null,
  lastErrorCode = null,
  staleAfterHours,
  now = new Date(),
}: IntegrationHealthInput): IntegrationHealth {
  if (!configurationReady || !configured)
    return {
      level: "not-ready",
      label: "Belum disiapkan",
      summary: "Kredensial atau konfigurasi server belum lengkap.",
      recovery: "Lengkapi konfigurasi privat, lalu sambungkan layanan.",
      lastCheckedAt: null,
    };
  if (lastErrorCode === "authorization")
    return {
      level: "reconnect",
      label: "Perlu sambungkan ulang",
      summary: lastError || "Otorisasi Google Ads tidak lagi berlaku.",
      recovery: "Sambungkan ulang akun Google yang berwenang. Verifikasi passkey dilakukan oleh Google.",
      lastCheckedAt: lastSyncAt,
    };
  if (lastErrorCode === "developer_token" || lastErrorCode === "cloud_project")
    return {
      level: "attention",
      label: "Akses API belum siap",
      summary: lastError || "Project Google Cloud belum memiliki akses Google Ads API produksi.",
      recovery: "Periksa persetujuan akses Explorer pada project Google Cloud pemilik OAuth client.",
      lastCheckedAt: lastSyncAt,
    };
  if (lastErrorCode === "oauth_configuration")
    return {
      level: "not-ready",
      label: "Konfigurasi OAuth belum siap",
      summary: lastError || "OAuth Client di server belum dapat digunakan.",
      recovery: "Lengkapi OAuth Client ID, Client Secret, redirect URI, dan kunci enkripsi di environment privat.",
      lastCheckedAt: lastSyncAt,
    };
  if (lastErrorCode === "oauth_network" || lastErrorCode === "timeout" || lastErrorCode === "report_unavailable")
    return {
      level: "attention",
      label: "Google Ads sementara tidak merespons",
      summary: lastError || "Pemeriksaan terakhir belum mendapat respons dari Google Ads.",
      recovery: "Tunggu beberapa saat lalu verifikasi akses API kembali. Laporan tersimpan tetap dapat dibaca.",
      lastCheckedAt: lastSyncAt,
    };
  if (lastErrorCode === "probe_required")
    return {
      level: "needs-test",
      label: "Verifikasi akses API diperlukan",
      summary: lastError || "Laporan belum diperbarui karena akses API belum diverifikasi baru-baru ini.",
      recovery: "Administrator perlu menjalankan Verifikasi akses API sebelum memperbarui laporan.",
      lastCheckedAt: lastSyncAt,
    };
  if (lastErrorCode === "manager_link")
    return {
      level: "attention",
      label: "MCC perlu ditautkan",
      summary: lastError || "MCC belum dapat mengakses akun iklan.",
      recovery: "Tautkan akun iklan ke MCC aktif, lalu periksa MCC Login Customer ID.",
      lastCheckedAt: lastSyncAt,
    };
  if (lastErrorCode === "customer_access")
    return {
      level: "attention",
      label: "Izin akun diperlukan",
      summary: lastError || "Akun Google yang tersambung belum dapat membaca laporan.",
      recovery: "Pastikan akun OAuth owner memiliki akses ke akun iklan yang dilaporkan.",
      lastCheckedAt: lastSyncAt,
    };
  const mailRecovery: Partial<Record<string, string>> = {
    mail_authentication: "Masukkan ulang kata sandi Email CS lalu jalankan uji koneksi.",
    mail_dns_network: "Periksa DNS, jaringan VPS, dan ketersediaan server mailbox.",
    mail_tls: "Periksa sertifikat TLS serta konfigurasi host dan port mailbox.",
    mail_timeout:
      "Server mailbox tidak merespons. Password belum dapat diverifikasi; periksa akses IMAP/SMTP atau firewall, lalu uji ulang.",
    mail_folder: "Periksa ketersediaan folder Inbox dan Sent pada mailbox.",
    mail_unknown: "Jalankan pemeriksaan ulang; jika tetap gagal, periksa konfigurasi mailbox.",
  };
  if (lastErrorCode && mailRecovery[lastErrorCode])
    return {
      level: "attention",
      label: lastErrorCode === "mail_timeout" ? "Server mailbox tidak merespons" : "Email CS perlu perhatian",
      summary: lastError || "Pemeriksaan mailbox terakhir gagal.",
      recovery: mailRecovery[lastErrorCode]!,
      lastCheckedAt: lastSyncAt,
    };
  if (lastError)
    return {
      level: "attention",
      label: "Perlu perhatian",
      summary: lastError,
      recovery: "Jalankan pemeriksaan ulang. Jika tetap gagal, periksa akses akun atau kredensial.",
      lastCheckedAt: lastSyncAt,
    };
  if (!lastSyncAt)
    return {
      level: "needs-test",
      label: "Perlu diuji",
      summary: "Kredensial tersimpan, tetapi belum ada pemeriksaan berhasil.",
      recovery: "Jalankan pemeriksaan untuk memastikan layanan dapat digunakan.",
      lastCheckedAt: null,
    };
  const ageMs = now.getTime() - lastSyncAt.getTime();
  if (ageMs > staleAfterHours * 60 * 60 * 1000)
    return {
      level: "attention",
      label: "Perlu perhatian",
      summary: "Pemeriksaan terakhir sudah terlalu lama untuk dianggap terkini.",
      recovery: "Jalankan pembaruan manual untuk memastikan data dan koneksi masih tersedia.",
      lastCheckedAt: lastSyncAt,
    };
  return {
    level: "healthy",
    label: "Sehat",
    summary: "Koneksi dan data terakhir berhasil diperiksa.",
    recovery: "Tidak ada tindakan yang diperlukan saat ini.",
    lastCheckedAt: lastSyncAt,
  };
}

export const INTEGRATION_HEALTH_STALE_HOURS = {
  // The VPS checks Email CS every five minutes. Fifteen minutes means the
  // mailbox is no longer fresh enough to claim that it is live.
  mail: 0.25,
  googleAds: 36,
} as const;

export function getSchedulerHealth(lastScheduledRunAt: Date | null, now = new Date(), staleAfterMinutes = 15) {
  if (!lastScheduledRunAt)
    return {
      level: "needs-test" as const,
      label: "Belum terdeteksi",
      summary: "Scheduler VPS belum pernah melaporkan eksekusi.",
    };
  const ageMs = now.getTime() - lastScheduledRunAt.getTime();
  if (ageMs > staleAfterMinutes * 60 * 1000)
    return {
      level: "attention" as const,
      label: "Heartbeat terlambat",
      summary: `Tidak ada eksekusi scheduler dalam ${staleAfterMinutes} menit terakhir.`,
    };
  return {
    level: "healthy" as const,
    label: "Aktif",
    summary: `Scheduler terakhir melapor dalam ${staleAfterMinutes} menit terakhir.`,
  };
}
