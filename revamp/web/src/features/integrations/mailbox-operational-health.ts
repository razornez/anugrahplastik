import type { IntegrationHealth, IntegrationHealthLevel } from "./integration-health";

type SchedulerHealth = {
  level: "needs-test" | "healthy" | "attention";
  label: string;
  summary: string;
};

export type MailboxOperationalHealth = IntegrationHealth & {
  nextExpectedAt: Date | null;
};

/**
 * Turns provider and scheduler facts into one owner-facing mailbox status.
 * A stored secret or an old inbox must never be presented as a live mailbox.
 */
export function getMailboxOperationalHealth({
  connection,
  scheduler,
  schedulerLastRunAt,
  lastSyncAt,
  lastErrorCode = null,
  isLocalRuntime,
  schedulerConfigured = true,
  isRunning = false,
  now = new Date(),
}: {
  connection: IntegrationHealth;
  scheduler: SchedulerHealth;
  schedulerLastRunAt: Date | null;
  lastSyncAt: Date | null;
  lastErrorCode?: string | null;
  isLocalRuntime: boolean;
  schedulerConfigured?: boolean;
  isRunning?: boolean;
  now?: Date;
}): MailboxOperationalHealth {
  if (isRunning)
    return {
      level: "needs-test",
      label: "Memperbarui kotak masuk",
      summary: "Pemeriksaan mailbox sedang berjalan. Email yang sudah tersimpan tetap dapat dibuka.",
      recovery: "Tunggu pemeriksaan selesai; jangan membuka pemeriksaan kedua dari tab lain.",
      lastCheckedAt: lastSyncAt,
      nextExpectedAt: null,
    };

  // A local server has no scheduler by design. Its old timestamp means only
  // that the owner has not pressed refresh recently, not that the provider is
  // unreachable.
  if (isLocalRuntime && !lastErrorCode && connection.level === "attention")
    return {
      level: "needs-test",
      label: "Data diperbarui manual",
      summary: "Data mailbox tersimpan; komputer lokal tidak menjalankan pembaruan otomatis.",
      recovery: "Pilih Segarkan sekarang saat ingin mengambil email terbaru.",
      lastCheckedAt: connection.lastCheckedAt,
      nextExpectedAt: null,
    };

  if (connection.level !== "healthy") {
    const labelByCode: Partial<Record<string, string>> = {
      mail_authentication: "Kredensial mailbox ditolak",
      mail_dns_network: "Server mailbox tidak dapat dijangkau",
      mail_tls: "Keamanan TLS mailbox bermasalah",
      mail_timeout: "Server mailbox tidak merespons",
      mail_folder: "Folder mailbox tidak tersedia",
      mail_unknown: "Pemeriksaan mailbox gagal",
    };
    return {
      ...connection,
      label:
        labelByCode[lastErrorCode ?? ""] ??
        (connection.level === "attention" && !lastErrorCode ? "Data belum terbaru" : connection.label),
      nextExpectedAt: null,
    };
  }

  if (isLocalRuntime)
    return {
      ...connection,
      label: "Data diperbarui manual",
      summary: "Pemeriksaan terakhir berhasil. Komputer lokal tidak menjalankan pembaruan otomatis.",
      recovery: "Pilih Segarkan sekarang saat ingin mengambil email terbaru.",
      nextExpectedAt: null,
    };

  if (!schedulerConfigured)
    return {
      level: "needs-test",
      label: "Pembaruan otomatis belum disiapkan",
      summary: "Mailbox terakhir berhasil diperiksa, tetapi VPS belum memiliki konfigurasi scheduler lengkap.",
      recovery: "Lengkapi token scheduler dan URL HTTPS sinkronisasi di environment VPS sebelum mengaktifkan timer.",
      lastCheckedAt: connection.lastCheckedAt,
      nextExpectedAt: null,
    };

  const nextExpectedAt = schedulerLastRunAt ? new Date(schedulerLastRunAt.getTime() + 5 * 60_000) : null;
  if (scheduler.level !== "healthy")
    return {
      level: "attention" as IntegrationHealthLevel,
      label: "Data belum terbaru",
      summary: "Mailbox terakhir berhasil diperiksa, tetapi scheduler VPS belum melapor tepat waktu.",
      recovery: "Periksa layanan scheduler VPS. Owner masih dapat memilih Segarkan sekarang untuk pemeriksaan manual.",
      lastCheckedAt: connection.lastCheckedAt,
      nextExpectedAt,
    };

  return {
    ...connection,
    label: "Email siap digunakan",
    summary: "Mailbox dapat diakses dan pembaruan otomatis VPS berjalan.",
    recovery: "Tidak ada tindakan yang diperlukan.",
    nextExpectedAt: nextExpectedAt && nextExpectedAt > now ? nextExpectedAt : new Date(now.getTime() + 5 * 60_000),
  };
}
