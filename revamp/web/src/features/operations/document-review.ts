export type DocumentReviewCode =
  | "local-render"
  | "provider-credit"
  | "provider-access"
  | "provider-pending"
  | "provider-response"
  | "archive"
  | "unknown";

export type DocumentReview = {
  code: DocumentReviewCode;
  message: string;
  checkedAt: string;
};

export function classifyDocumentFailure(error: unknown, local: boolean): DocumentReview {
  const detail = error instanceof Error ? error.message : "";
  let code: DocumentReviewCode = "unknown";
  let message = "Pembuatan PDF belum selesai. Administrator perlu memeriksa status proses sebelum mencoba lagi.";
  if (/Kredit DocGen/i.test(detail)) {
    code = "provider-credit";
    message = "Kredit DocGen tidak cukup. Isi saldo layanan sebelum melanjutkan PDF yang sama.";
  } else if (/Akses DocGen|API key|dikonfigurasi/i.test(detail)) {
    code = "provider-access";
    message = "Koneksi DocGen perlu diperiksa administrator. Dokumen belum siap untuk dikirim.";
  } else if (/belum menyelesaikan|Status PDF|timeout|fetch failed/i.test(detail)) {
    code = "provider-pending";
    message = "DocGen belum memastikan hasil PDF. Periksa batch yang sama sebelum melanjutkan.";
  } else if (/Jawaban DocGen|bukan PDF|tidak valid/i.test(detail)) {
    code = "provider-response";
    message = "Hasil DocGen tidak valid. Periksa hasil layanan sebelum melanjutkan.";
  } else if (/diarsipkan|storage|ENOENT|EACCES/i.test(detail)) {
    code = "archive";
    message = "PDF belum berhasil disimpan ke arsip privat. Periksa penyimpanan sebelum melanjutkan.";
  } else if (local) {
    code = "local-render";
    message = "Renderer PDF lokal gagal. Periksa template dan hasil render; dokumen belum memiliki pratinjau.";
  }
  return { code, message, checkedAt: new Date().toISOString() };
}

export function readDocumentReview(payload: unknown): DocumentReview | null {
  if (!payload || typeof payload !== "object") return null;
  const review = (payload as { generationReview?: unknown }).generationReview;
  if (!review || typeof review !== "object") return null;
  const value = review as Partial<DocumentReview>;
  if (typeof value.code !== "string" || typeof value.message !== "string" || typeof value.checkedAt !== "string")
    return null;
  return value as DocumentReview;
}

export function documentRevisionBlocker(status: string | null | undefined) {
  return status === "generating" || status === "needs_review";
}

export function documentRecoveryBlocker(input: {
  status: string;
  operationKey: string | null;
  templateId: string | null;
  providerDocumentId: string | null;
  hasRenderData: boolean;
  createdAt: Date;
  local: boolean;
  now?: number;
}) {
  if (input.status !== "needs_review" || !input.operationKey || !input.templateId)
    return "Dokumen ini tidak dapat dipulihkan otomatis. Periksa arsip dan statusnya secara manual.";
  if (!input.hasRenderData)
    return "Data render belum lengkap. Periksa template dan data transaksi; pemulihan otomatis belum aman.";
  if (!input.local && !input.providerDocumentId?.startsWith("batch_"))
    return "Nomor proses DocGen belum tercatat. Cocokkan hasil di DocGen sebelum mencoba lagi agar tidak terjadi duplikasi.";
  if (!input.local && (input.now ?? Date.now()) - input.createdAt.getTime() > 20 * 60 * 60 * 1000)
    return "Batas kunci aman DocGen telah lewat. Periksa dokumen secara manual sebelum menerbitkan versi baru.";
  return null;
}
