import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import { privateFilePath } from "./private-storage";

export type QuotationAttachment = {
  id: string;
  originalName: string | null;
  storagePath: string | null;
  checksum: string | null;
  category: string;
  caption: string;
};

const maxTotalBytes = 30 * 1024 * 1024;
const maxPages = 40;
const pdfLabel = (value: string, length: number) => value.slice(0, length).replace(/[^\x20-\x7E]/g, "?");

export async function appendQuotationAttachments(
  base: Buffer,
  attachments: QuotationAttachment[],
  markAsExample: boolean,
) {
  const pdf = await PDFDocument.load(base, { ignoreEncryption: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let bytesRead = base.length;
  for (const attachment of attachments) {
    if (!attachment.storagePath || !attachment.checksum) throw new Error("Lampiran penawaran tidak lengkap.");
    const path = privateFilePath(attachment.storagePath);
    const content = await readFile(path);
    bytesRead += content.length;
    if (content.length > 10 * 1024 * 1024 || bytesRead > maxTotalBytes)
      throw new Error("Ukuran seluruh lampiran penawaran melebihi batas 30 MB.");
    if (createHash("sha256").update(content).digest("hex") !== attachment.checksum)
      throw new Error("Checksum lampiran penawaran tidak cocok.");
    const extension = extname(basename(attachment.originalName ?? "")).toLowerCase();
    if (extension === ".pdf") {
      if (content.subarray(0, 5).toString() !== "%PDF-") throw new Error("Lampiran PDF tidak valid.");
      const source = await PDFDocument.load(content, { ignoreEncryption: false });
      if (source.getPageCount() < 1 || source.getPageCount() + pdf.getPageCount() > maxPages)
        throw new Error("Jumlah halaman lampiran terlalu banyak.");
      const pages = await pdf.copyPages(source, source.getPageIndices());
      for (const page of pages) {
        page.node.delete(PDFName.of("Annots"));
        pdf.addPage(page);
      }
    } else if (extension === ".jpg" || extension === ".jpeg" || extension === ".png") {
      if (pdf.getPageCount() + 1 > maxPages) throw new Error("Jumlah halaman lampiran terlalu banyak.");
      const image = extension === ".png" ? await pdf.embedPng(content) : await pdf.embedJpg(content);
      const page = pdf.addPage([595.28, 841.89]);
      page.drawText(pdfLabel(attachment.category, 60), {
        x: 42,
        y: 792,
        size: 13,
        font,
        color: rgb(0.04, 0.14, 0.26),
      });
      page.drawText(pdfLabel(attachment.caption, 95), {
        x: 42,
        y: 773,
        size: 9,
        font,
        color: rgb(0.3, 0.37, 0.45),
      });
      const scale = Math.min(511 / image.width, 690 / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, { x: (595.28 - width) / 2, y: 45 + (690 - height) / 2, width, height });
    } else {
      throw new Error("Format lampiran penawaran tidak diizinkan.");
    }
  }
  if (markAsExample) {
    for (const page of pdf.getPages()) {
      const { height } = page.getSize();
      page.drawRectangle({ x: 0, y: height - 23, width: page.getWidth(), height: 23, color: rgb(1, 0.94, 0.86) });
      page.drawText("DRAF CONTOH - BUKAN DOKUMEN RESMI", {
        x: 35,
        y: height - 16,
        size: 9,
        font,
        color: rgb(0.53, 0.2, 0.03),
      });
    }
  }
  const result = Buffer.from(await pdf.save());
  if (result.length > maxTotalBytes) throw new Error("PDF penawaran terlalu besar untuk disimpan.");
  return result;
}
