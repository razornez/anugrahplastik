"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { runSeoAudit } from "./seo-audit-service";
import { runMarketSignals } from "./market-signals";
import { runSearchDiscovery } from "./search-discovery";

export async function runSeoAuditAction(_previous: string | null): Promise<string> {
  void _previous;
  const user = await getSession();
  if (!user || user.role !== "admin") throw new Error("Hanya administrator yang boleh menjalankan audit SEO.");
  try {
    const result = await runSeoAudit();
    if (result.status !== "running") {
      await runSearchDiscovery();
      await runMarketSignals();
    }
    revalidatePath("/admin/growth");
    revalidatePath("/admin/growth/competitors");
    return result.status === "complete"
      ? "Audit SEO selesai. Peringkat dan bukti halaman telah diperbarui."
      : result.status === "running"
        ? "Audit minggu ini sedang berjalan. Muat ulang halaman beberapa saat lagi."
        : "Audit minggu ini sudah tersedia; tidak ada pencarian tambahan yang digunakan.";
  } catch (error) {
    return error instanceof Error ? error.message : "Audit SEO gagal. Hasil sebelumnya tetap tersedia.";
  }
}
