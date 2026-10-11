// Credit-free layout check using local DocGen renderer and fictitious data.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rendererFile = resolve(process.cwd(), "../../../docgen/packages/renderer/dist/index.js");
const { renderHtml, PdfRenderer } = await import(pathToFileURL(rendererFile).href);
const template = await readFile("docs/templates/surat-jalan-docgen.html", "utf8");
const logo = await readFile("public/brand/quotation-logo.png");
const outputDir = await mkdtemp(join(tmpdir(), "delivery-preview-"));
const renderer = new PdfRenderer();
const row = (index) =>
  `<tr><td>${index}</td><td>Spacer conduit contoh ukuran ${index} inci</td><td>2</td><td>10</td><td>1.000 pcs</td><td>20,5</td><td>19,8</td><td>1 plastik isi 100 pcs</td></tr>`;
try {
  for (const count of [2, 30]) {
    const html = renderHtml(template, {
      nomor_surat_jalan: "UJI-TRX-2026-SJ-01",
      versi: "Penerbitan pertama",
      tanggal: "29 September 2026",
      nama_pelanggan: "[UJI] Pelanggan fiktif",
      penerima: "PT Penerima Contoh",
      alamat: "Alamat tujuan fiktif, Bandung",
      nomor_po: "PO-UJI-001",
      nomor_do: "DO-UJI-001",
      nama_pengirim: "Pengirim Contoh",
      nama_supir: "Supir Contoh",
      nama_penerima_ttd: "Penerima Contoh",
      nomor_polisi: "D 0000 UJI",
      catatan: "Periksa jumlah dan kondisi barang.",
      penerbit: "CV. ANUGRAHPLASTIK MANDIRI BANDUNG",
      alamat_penerbit: "Alamat contoh untuk pratinjau tata letak",
      telepon_penerbit: "000-000",
      email_penerbit: "uji@example.invalid",
      situs_penerbit: "contoh.invalid",
      logo: `data:image/png;base64,${logo.toString("base64")}`,
      baris_barang: Array.from({ length: count }, (_, index) => row(index + 1)).join(""),
    });
    if (html.includes("{{")) throw new Error("Masih ada placeholder pada HTML surat jalan.");
    const { pdf, pageCount } = await renderer.render(html);
    const file = join(outputDir, `surat-jalan-${count}-item.pdf`);
    await writeFile(file, pdf);
    process.stdout.write(`${file} (${pageCount} halaman)\n`);
  }
} finally {
  await renderer.close();
}
