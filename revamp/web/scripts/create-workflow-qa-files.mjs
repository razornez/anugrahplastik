import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve("storage/workflow-qa/ef92a548-2735-41fb-b0af-5d677ccc084a");
await mkdir(directory, { recursive: true });
for (const name of [
  "po",
  "stb-80",
  "stb-20",
  "lampiran-1",
  "lampiran-2",
  "lampiran-3",
  "lampiran-4",
  "lampiran-5",
  "lampiran-6",
]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText("[UJI] DOKUMEN FIKTIF - BUKAN BUKTI PELANGGAN", { x: 36, y: 790, size: 15, font });
  page.drawText(`${name}: QA lokal, workflow@example.invalid`, { x: 36, y: 750, size: 12, font });
  page.drawText("Simulasi unggahan saja; tidak ada tanda tangan buatan.", { x: 36, y: 710, size: 12, font });
  await writeFile(resolve(directory, `${name}.pdf`), await pdf.save(), { mode: 0o600 });
}
await writeFile(resolve(directory, "rusak.pdf"), "[UJI] not a PDF", { mode: 0o600 });
console.log(directory);
