"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { runMarketSignals } from "./market-signals";
import { runSearchDiscovery } from "./search-discovery";

export async function runOpportunityDiscoveryAction(_previous: string | null, formData: FormData): Promise<string> {
  void _previous;
  const user = await getSession();
  if (!user || user.role !== "admin") throw new Error("Hanya administrator yang boleh memeriksa peluang.");
  if (formData.get("confirmed") !== "on") return "Konfirmasi penggunaan jatah pencarian sebelum melanjutkan.";
  try {
    const search = await runSearchDiscovery();
    const trend = await runMarketSignals();
    revalidatePath("/admin/growth");
    const searchMessage =
      search === "complete"
        ? "Frasa dan pertanyaan telah diperiksa."
        : search === "existing"
          ? "Pemeriksaan frasa minggu ini sudah tercatat."
          : search === "skipped"
            ? "Frasa belum diperiksa karena jatah tambahan tidak cukup."
            : search === "not_needed"
              ? "Frasa dan pertanyaan sudah termasuk dalam audit peringkat terbaru."
              : "Pemeriksaan frasa belum selesai.";
    const trendMessage =
      trend === "complete"
        ? " Tren produk telah diperiksa."
        : trend === "existing"
          ? " Pemeriksaan tren minggu ini sudah tercatat."
          : trend === "skipped"
            ? " Tren ditunda untuk menjaga jatah audit peringkat."
            : " Tren belum berhasil diperiksa.";
    return searchMessage + trendMessage;
  } catch (error) {
    return error instanceof Error ? error.message : "Pemeriksaan peluang gagal. Hasil sebelumnya tetap tersedia.";
  }
}
