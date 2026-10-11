import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { businessTransactions, transactionDocuments } from "@/lib/database/schema";
import {
  assertDocGenTransactionAllowed,
  docGenProviderReady,
  docGenTemplateReady,
  localQaRendererEnabled,
} from "./docgen-policy";
import { renderLocalQaPdf } from "./local-qa-renderer";
import { preparePrivateDestination } from "./private-storage";

type BatchResult = { id: string; status: string };
type BatchDocument = { id: string; status: string; output_url: string | null };

export function docGenReady() {
  return docGenProviderReady("QUOTATION");
}

export function quotationTemplateReady() {
  return docGenTemplateReady("QUOTATION");
}

export async function assertDocGenTestTransaction(transactionId: string) {
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [transaction] = await database
    .select({ dataClass: businessTransactions.dataClass })
    .from(businessTransactions)
    .where(eq(businessTransactions.id, transactionId));
  if (!transaction) throw new Error("Transaksi tidak ditemukan.");
  assertDocGenTransactionAllowed(transaction.dataClass);
}

export async function renderDocGenPdf(options: {
  templateId: string;
  data: Record<string, string | boolean>;
  filename: string;
  operationKey: string;
  transactionId: string;
  documentId: string;
  postProcess?: (pdf: Buffer) => Promise<Buffer>;
}) {
  await assertDocGenTestTransaction(options.transactionId);
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [saved] = await database
    .select({ providerDocumentId: transactionDocuments.providerDocumentId, payload: transactionDocuments.payload })
    .from(transactionDocuments)
    .where(
      and(
        eq(transactionDocuments.id, options.documentId),
        eq(transactionDocuments.transactionId, options.transactionId),
        eq(transactionDocuments.operationKey, options.operationKey),
      ),
    );
  if (!saved) throw new Error("Dokumen tidak ditemukan.");
  if (localQaRendererEnabled()) {
    let buffer = await renderLocalQaPdf(options.templateId, options.data);
    if (options.postProcess) buffer = await options.postProcess(buffer);
    return archivePdf(options.transactionId, `local_qa:${options.operationKey}`, buffer);
  }
  if ((saved.payload as { renderSource?: string } | null)?.renderSource === "local_qa") {
    throw new Error("Dokumen QA hanya dapat dirender pada proses QA lokal.");
  }
  const apiKey = process.env.DOCGEN_API_KEY;
  if (!apiKey) throw new Error("DocGen belum dikonfigurasi. Administrator perlu menambahkan API key.");
  let batchId = saved.providerDocumentId;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  if (!batchId) {
    const response = await fetch("https://docgen.razornez.net/v1/batches", {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": options.operationKey },
      body: JSON.stringify({
        template: options.templateId,
        items: [{ ref: options.operationKey, data: options.data }],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(
        response.status === 402
          ? "Kredit DocGen tidak cukup. Isi saldo DocGen sebelum membuat PDF."
          : response.status === 401 || response.status === 403
            ? "Akses DocGen perlu diperiksa administrator."
            : "DocGen belum menerima permintaan PDF. Periksa layanan sebelum mencoba kembali.",
      );
    }
    const batch = (await response.json()) as Partial<BatchResult>;
    if (!batch.id?.startsWith("batch_"))
      throw new Error("Jawaban DocGen tidak valid; periksa dokumen sebelum mengulang.");
    batchId = batch.id;
    await database
      .update(transactionDocuments)
      .set({ providerDocumentId: batchId })
      .where(eq(transactionDocuments.id, options.documentId));
  }
  if (!batchId.startsWith("batch_")) throw new Error("ID batch DocGen tidak valid.");
  let result: BatchDocument | undefined;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(`https://docgen.razornez.net/v1/batches/${batchId}/documents`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Status PDF DocGen belum dapat diperiksa.");
    const listing = (await response.json()) as { data?: BatchDocument[] };
    result = listing.data?.find((item) => item.id && item.status);
    if (result?.status === "completed" || result?.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (result?.status === "failed") throw new Error("Renderer PDF DocGen gagal. Periksa layanan sebelum mencoba lagi.");
  if (result?.status !== "completed" || !result.id || !result.output_url) {
    throw new Error("DocGen belum menyelesaikan PDF. Periksa status dokumen sebelum mencoba kembali.");
  }
  const url = new URL(result.output_url);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "docgen.razornez.net" &&
      url.hostname !== "files.docgen.id" &&
      !url.hostname.endsWith(".docgen.id"))
  ) {
    throw new Error("Alamat PDF dari DocGen tidak sesuai domain yang diizinkan.");
  }
  const pdfResponse = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000) });
  const length = Number(pdfResponse.headers.get("content-length") ?? 0);
  if (!pdfResponse.ok || length > 15 * 1024 * 1024) throw new Error("PDF DocGen tidak dapat diarsipkan.");
  let buffer: Buffer = Buffer.from(await pdfResponse.arrayBuffer());
  if (buffer.length < 5 || buffer.length > 15 * 1024 * 1024 || buffer.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("Berkas dari DocGen bukan PDF yang valid.");
  }
  if (options.postProcess) buffer = await options.postProcess(buffer);
  return archivePdf(options.transactionId, result.id, buffer);
}

async function archivePdf(transactionId: string, providerDocumentId: string, buffer: Buffer) {
  const relativePath = join("transactions", transactionId, `${randomUUID()}.pdf`);
  const destination = await preparePrivateDestination(relativePath);
  await writeFile(destination, buffer, { flag: "wx", mode: 0o600 });
  return {
    providerDocumentId,
    storagePath: relativePath,
    checksum: createHash("sha256").update(buffer).digest("hex"),
  };
}
