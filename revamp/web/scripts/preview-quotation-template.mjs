// Credit-free visual check using the local DocGen renderer and fictitious data.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rendererFile = resolve(process.cwd(), "../../../docgen/packages/renderer/dist/index.js");
const { renderHtml, PdfRenderer } = await import(pathToFileURL(rendererFile).href);
const template = await readFile("docs/templates/penawaran-docgen.html", "utf8");
const logo = await readFile("public/brand/quotation-logo.png");
const outputDir = await mkdtemp(join(tmpdir(), "quotation-preview-"));
const renderer = new PdfRenderer();
const row = (index) =>
  `<tr><td>${index}</td><td>Spacer conduit contoh ukuran ${index} inci</td><td>Sudah tersedia</td><td>Polypropylene hitam</td><td>100 set</td><td>Rp15.000</td><td>Rp1.500.000</td><td>10%</td></tr>`;
try {
  for (const count of [2, 30]) {
    const html = renderHtml(template, {
      nomor_penawaran: "UJI-TRX-2026-001",
      revisi: "Penerbitan pertama",
      tanggal: "29 September 2026",
      nomor_transaksi: "TRX-2026-UJI01",
      perihal: "Spacer conduit untuk uji tata letak",
      penerima: "[UJI] Pelanggan fiktif",
      pic_penerima: "Bapak Contoh",
      alamat_penerima: "Alamat fiktif, Bandung",
      masa_berlaku: "6 Oktober 2026",
      syarat_ongkir: "Ongkos kirim disepakati terpisah.",
      syarat_bayar: "DP 50%; pelunasan setelah barang diterima.",
      waktu_pengerjaan: "Tiga minggu setelah PO dan DP diterima.",
      catatan: "Drawing dan spesifikasi terlampir bila dipilih.",
      penerbit: "CV. ANUGRAHPLASTIK MANDIRI BANDUNG",
      alamat_penerbit: "Alamat contoh untuk pratinjau tata letak",
      telepon_penerbit: "000-000",
      email_penerbit: "uji@example.invalid",
      situs_penerbit: "contoh.invalid",
      penanda_tangan: "Penanda tangan contoh",
      jabatan: "Administrator",
      logo: `data:image/png;base64,${logo.toString("base64")}`,
      baris_barang: Array.from({ length: count }, (_, index) => row(index + 1)).join(""),
      total_harga: `Rp${(1_500_000 * count).toLocaleString("id-ID")}`,
      diskon: `Rp${(150_000 * count).toLocaleString("id-ID")}`,
      nilai_setelah_diskon: `Rp${(1_350_000 * count).toLocaleString("id-ID")}`,
      dpp: `Rp${(1_237_500 * count).toLocaleString("id-ID")}`,
      label_pajak: "PPN 12% × DPP nilai lain 11/12",
      pajak: `Rp${(148_500 * count).toLocaleString("id-ID")}`,
      grand_total: `Rp${(1_498_500 * count).toLocaleString("id-ID")}`,
      lampiran: "1. Drawing contoh (Drawing)<br>2. Foto produk contoh (Foto produk)",
    });
    if (html.includes("{{")) throw new Error("Masih ada placeholder pada HTML penawaran.");
    const { pdf, pageCount } = await renderer.render(html);
    const file = join(outputDir, `penawaran-${count}-item.pdf`);
    await writeFile(file, pdf);
    process.stdout.write(`${file} (${pageCount} halaman)\n`);
  }
} finally {
  await renderer.close();
}
