// Credit-free local layout check using the sibling DocGen renderer. No API or customer data.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rendererFile = resolve(process.cwd(), "../../../docgen/packages/renderer/dist/index.js");
const { renderHtml, PdfRenderer } = await import(pathToFileURL(rendererFile).href);
const template = await readFile("docs/templates/invoice-resmi-docgen.html", "utf8");
const sampleRow = (index) =>
  `<tr><td>${index}</td><td>Spacer conduit HDPE contoh ${index}</td><td>40 pcs</td><td>HDPE</td><td>Rp10.000</td><td>Rp400.000</td><td>Rp40.000 (10%)</td></tr>`;
const common = {
  logo: "",
  penerbit: "CONTOH PENERBIT (BELUM DISETUJUI)",
  alamat_penerbit: "Alamat fiktif untuk pemeriksaan tata letak",
  telepon_penerbit: "000-000",
  email_penerbit: "contoh@example.invalid",
  situs_penerbit: "contoh.invalid",
  npwp_penerbit: "-",
  jenis_tagihan: "INVOICE PELUNASAN",
  nomor_invoice: "UJI-INV-001",
  nama_pelanggan: "PELANGGAN FIKTIF",
  alamat_pelanggan: "Alamat contoh, Bandung",
  npwp_pelanggan: "-",
  tanggal: "29 September 2026",
  jatuh_tempo: "29 Oktober 2026",
  nomor_po: "PO-UJI-001",
  nomor_transaksi: "TRX-UJI-001",
  pekerjaan: "Spacer conduit bawah tanah (contoh)",
  catatan_item: "Rincian barang yang ditagih pada pengiriman ini.",
  catatan_referensi: "",
  label_total_harga: "Total harga barang",
  label_subtotal: "Nilai barang setelah diskon",
  dp_diterapkan: "Rp0",
  syarat_bayar: "Pembayaran sesuai tanggal jatuh tempo.",
  bank: "Bank contoh",
  nomor_rekening: "000000",
  nama_rekening: "Penerbit contoh",
  penanda_tangan: "Penanda tangan contoh",
  jabatan: "Administrator",
};
const outputDir = await mkdtemp(join(tmpdir(), "invoice-preview-"));
const renderer = new PdfRenderer();
try {
  for (const count of [2, 30]) {
    const idr = (value) => `Rp${new Intl.NumberFormat("id-ID").format(value)}`;
    const html = renderHtml(template, {
      ...common,
      total_harga: idr(400000 * count),
      diskon: idr(40000 * count),
      nilai_setelah_diskon: idr(360000 * count),
      ppn_barang: idr(39600 * count),
      total_barang: idr(399600 * count),
      dpp: idr(360000 * count),
      dpp_nilai_lain: idr(330000 * count),
      ppn: idr(39600 * count),
      total_tagihan: idr(399600 * count),
      baris_barang: Array.from({ length: count }, (_, index) => sampleRow(index + 1)).join(""),
    });
    if (html.includes("{{")) throw new Error("Masih ada placeholder pada HTML invoice.");
    const { pdf, pageCount } = await renderer.render(html);
    const file = join(outputDir, `invoice-${count}-item.pdf`);
    await writeFile(file, pdf);
    process.stdout.write(`${file} (${pageCount} halaman)\n`);
  }
} finally {
  await renderer.close();
}
