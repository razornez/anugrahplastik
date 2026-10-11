"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { addBusinessProspect, reviewBusinessCandidate, runBusinessSearch } from "./business-discovery-service";

export type BusinessActionState = { message: string; leadId?: string };

export async function businessDiscoveryAction(
  _previous: BusinessActionState,
  form: FormData,
): Promise<BusinessActionState> {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role))
    return { message: "Akses calon pelanggan hanya untuk admin/sales." };
  const operation = form.get("operation");
  const uuid = z.string().uuid();
  try {
    let message: string;
    let leadId: string | undefined;
    if (operation === "search") {
      if (user.role !== "admin") return { message: "Hanya administrator yang boleh memakai jatah pencarian." };
      if (form.get("confirmed") !== "yes") return { message: "Konfirmasi satu permintaan API terlebih dahulu." };
      message = await runBusinessSearch(String(form.get("phrase") ?? ""), String(form.get("city") ?? ""), user.id);
    } else if (operation === "review") {
      const id = uuid.parse(form.get("candidateId"));
      const status = z.enum(["new", "relevant", "dismissed"]).parse(form.get("status"));
      await reviewBusinessCandidate(id, status, user.id);
      message = "Status tinjauan disimpan.";
    } else if (operation === "add") {
      if (form.get("confirmed") !== "yes")
        return { message: "Periksa identitas dan kontak, lalu konfirmasi penambahan." };
      leadId = await addBusinessProspect(
        uuid.parse(form.get("candidateId")),
        uuid.parse(form.get("assignedUserId")),
        user.id,
      );
      message = "Kandidat tersedia di Prospek sebagai hasil riset, bukan permintaan masuk.";
    } else return { message: "Tindakan tidak dikenali." };
    revalidatePath("/admin/growth");
    revalidatePath("/admin/prospects");
    revalidatePath("/admin");
    return { message, leadId };
  } catch (error) {
    // Return only our validation/business errors, never raw database/network diagnostics.
    if (error instanceof z.ZodError) return { message: "Periksa pilihan kandidat, status, dan penanggung jawab." };
    const safeMessages = [
      "Database belum terhubung.",
      "Pilih wilayah dan isi frasa industri sepanjang 3–120 karakter.",
      "SERPAPI_API_KEY belum tersedia dalam konfigurasi privat.",
      "Jatah pencarian perusahaan tidak tersedia. Batas empat permintaan dan cadangan audit tetap dilindungi.",
      "Identitas tempat belum stabil. Konfirmasikan identitas dari sumber sebelum menambahkan ke Prospek.",
      "Pilih penanggung jawab admin/sales yang aktif.",
      "Kandidat tidak ditemukan.",
    ];
    return {
      message:
        error instanceof Error && safeMessages.includes(error.message)
          ? error.message
          : "Tindakan belum berhasil. Data lama tetap tersedia; muat ulang lalu periksa statusnya.",
    };
  }
}
