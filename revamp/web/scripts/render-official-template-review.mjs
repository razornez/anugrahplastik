// Credit-free print review. This never calls the DocGen API or reads customer data.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rendererFile = resolve(process.cwd(), "../../../docgen/packages/renderer/dist/index.js");
const { renderHtml, PdfRenderer } = await import(pathToFileURL(rendererFile).href);
const logo = `data:image/png;base64,${(await readFile("public/brand/quotation-logo.png")).toString("base64")}`;
const outputDir = resolve(process.env.PDF_REVIEW_OUTPUT_DIR || "output/pdf");

const issuer = {
  penerbit: "CV. ANUGRAHPLASTIK MANDIRI BANDUNG",
  alamat_penerbit: "Perum Lebak Wangi Asri Blok A2 No.16, Bojong Pulus, Banjaran, Bandung",
  telepon_penerbit: "081 22 33 95 87",
  email_penerbit: "cs@anugrahplastik.com",
  situs_penerbit: "www.anugrahplastik.com",
};
const shared = { ...issuer, isPreview: true, isDummy: false };
const line = (cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;

const documents = [
  {
    name: "penawaran",
    template: "penawaran-docgen.html",
    data: {
      ...shared,
      logo,
      nomor_penawaran: "SP/AMB/UJI/IX/2026",
      revisi: "Penerbitan pertama",
      tanggal: "30 September 2026",
      nomor_transaksi: "TRX-UJI-001",
      perihal: "Spacer untuk Conduit Bawah Tanah",
      lampiran: "1. Drawing contoh (fiktif)",
      penerima: "PT PELANGGAN CONTOH",
      alamat_penerima: "Alamat fiktif, Bandung",
      pic_penerima: "Bapak Contoh",
      masa_berlaku: "7 Oktober 2026",
      syarat_ongkir: "Disepakati terpisah.",
      syarat_bayar: "DP 50%, sisanya setelah barang diterima.",
      waktu_pengerjaan: "Tiga minggu setelah PO dan DP diterima.",
      catatan: "Ukuran dan spesifikasi perlu dikonfirmasi dalam PO.",
      penanda_tangan: "Nama penanda tangan contoh",
      jabatan: "Perwakilan perusahaan",
      baris_barang: [
        line([
          "1",
          "Spacer conduit 8 inci",
          "Tersedia",
          "Polypropylene hitam",
          "100 set",
          "Rp15.000",
          "Rp1.500.000",
          "10%",
        ]),
        line([
          "2",
          "Spacer conduit 6 inci",
          "Tersedia",
          "Polypropylene hitam",
          "80 set",
          "Rp20.000",
          "Rp1.600.000",
          "Rp100.000",
        ]),
      ].join(""),
      total_harga: "Rp3.100.000",
      diskon: "Rp250.000",
      nilai_setelah_diskon: "Rp2.850.000",
      dpp: "Rp2.612.500",
      label_pajak: "PPN 12% x DPP nilai lain 11/12",
      pajak: "Rp313.500",
      grand_total: "Rp3.163.500",
    },
  },
  {
    name: "invoice",
    template: "invoice-resmi-docgen.html",
    data: {
      ...shared,
      logo: `<img alt="" src="${logo}" />`,
      nomor_invoice: "INV/AMB/UJI/IX/2026",
      tanggal: "30 September 2026",
      jatuh_tempo: "14 Oktober 2026",
      nomor_transaksi: "TRX-UJI-001",
      nomor_po: "PO-UJI-001",
      jenis_tagihan: "INVOICE PELUNASAN",
      pekerjaan: "Spacer untuk Conduit Bawah Tanah",
      nama_pelanggan: "PT PELANGGAN CONTOH",
      alamat_pelanggan: "Alamat fiktif, Bandung",
      npwp_pelanggan: "Belum dicantumkan",
      npwp_penerbit: "Nomor contoh - periksa konfigurasi sebelum rilis",
      baris_barang: [
        line(["1", "Spacer conduit 8 inci", "100 set", "Polypropylene", "Rp15.000", "Rp1.500.000", "Rp150.000 (10%)"]),
        line(["2", "Spacer conduit 6 inci", "80 set", "Polypropylene", "Rp20.000", "Rp1.600.000", "Rp100.000"]),
      ].join(""),
      catatan_item: "Rincian barang yang ditagih pada pengiriman ini.",
      catatan_referensi: "",
      label_total_harga: "Total harga barang",
      label_subtotal: "Nilai barang setelah diskon",
      total_harga: "Rp3.100.000",
      diskon: "Rp250.000",
      nilai_setelah_diskon: "Rp2.850.000",
      ppn_barang: "Rp313.500",
      total_barang: "Rp3.163.500",
      dpp: "Rp2.399.549,55",
      dpp_nilai_lain: "Rp2.199.587,09",
      ppn: "Rp263.950,45",
      dp_diterapkan: "Rp500.000",
      total_tagihan: "Rp2.663.500",
      syarat_bayar: "Pembayaran paling lambat pada tanggal jatuh tempo.",
      bank: "BANK CONTOH",
      nomor_rekening: "000000000",
      nama_rekening: "Rekening contoh - belum diverifikasi",
      penanda_tangan: "Nama penanda tangan contoh",
      jabatan: "Perwakilan perusahaan",
    },
  },
  {
    name: "surat-jalan",
    template: "surat-jalan-docgen.html",
    data: {
      ...shared,
      logo,
      nomor_surat_jalan: "SJ/AMB/UJI/IX/2026",
      versi: "Penerbitan pertama",
      tanggal: "30 September 2026",
      nama_pelanggan: "PT PELANGGAN CONTOH",
      penerima: "Bapak Contoh",
      alamat: "Lokasi proyek fiktif, Bandung",
      nomor_po: "PO-UJI-001",
      nomor_do: "DO-UJI-001",
      nama_pengirim: "Pengirim contoh",
      nama_supir: "Supir contoh",
      nama_penerima_ttd: "Penerima contoh",
      nomor_polisi: "D 0000 UJI",
      catatan: "Periksa jumlah dan kondisi saat barang tiba.",
      baris_barang: [
        line(["1", "Spacer conduit 8 inci", "2", "10 x 10 pcs/pack", "100 pcs", "12", "11", "Kemasan contoh"]),
        line(["2", "Spacer conduit 6 inci", "2", "8 x 10 pcs/pack", "80 pcs", "10", "9", "Kemasan contoh"]),
      ].join(""),
    },
  },
  {
    name: "stb",
    template: "bast-docgen.html",
    data: {
      ...shared,
      logo,
      nomor_stb: "STB/AMB/UJI/IX/2026",
      versi: "Penerbitan pertama",
      tanggal: "30 September 2026",
      nama_pelanggan: "PT PELANGGAN CONTOH",
      penerima: "Bapak Contoh",
      lokasi: "Lokasi proyek fiktif, Bandung",
      nomor_pengiriman: "KIRIM-UJI-001",
      nomor_surat_jalan: "SJ/AMB/UJI/IX/2026",
      nomor_po: "PO-UJI-001",
      nomor_do: "DO-UJI-001",
      referensi_po_do: "PO-UJI-001 / DO-UJI-001",
      nomor_polisi: "D 0000 UJI",
      kondisi: "Sebagian",
      catatan: "Diterima 80 dari 100 pcs; selisih perlu ditindaklanjuti.",
      nama_penyerah: "Penyerah contoh",
      nama_supir: "Supir contoh",
      nama_penerima_ttd: "Penerima contoh",
      baris_barang: [
        line(["1", "Spacer conduit 8 inci", "2", "10 x 10 pcs/pack", "100 pcs", "80 pcs", "11", "Selisih 20 pcs"]),
      ].join(""),
    },
  },
];

await mkdir(outputDir, { recursive: true });
const renderer = new PdfRenderer();
try {
  for (const document of documents) {
    const template = await readFile(`docs/templates/${document.template}`, "utf8");
    const variables = [...template.matchAll(/{{{?\s*([a-z_]+)\s*}?}}/g)].map((match) => match[1]);
    const missing = [...new Set(variables)].filter((key) => !(key in document.data));
    if (missing.length) throw new Error(`${document.name}: data pratinjau kurang: ${missing.join(", ")}`);
    const dummyHtml = renderHtml(template, { ...document.data, isDummy: true, isPreview: false });
    const officialHtml = renderHtml(template, { ...document.data, isDummy: false, isPreview: false });
    if (!dummyHtml.includes("DRAF CONTOH - BUKAN DOKUMEN RESMI")) {
      throw new Error(`${document.name}: penanda dokumen contoh tidak muncul`);
    }
    if (officialHtml.includes("DRAF CONTOH") || officialHtml.includes("PRATINJAU DESAIN")) {
      throw new Error(`${document.name}: penanda contoh bocor ke template resmi`);
    }
    const html = renderHtml(template, document.data);
    if (html.includes("{{")) throw new Error(`${document.name}: placeholder tersisa`);
    const { pdf, pageCount } = await renderer.render(html);
    const file = resolve(outputDir, `pratinjau-${document.name}.pdf`);
    await writeFile(file, pdf);
    process.stdout.write(`${file} (${pageCount} halaman)\n`);
  }
} finally {
  await renderer.close();
}
