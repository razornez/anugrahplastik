// Local-only bootstrap for the four approved source templates. It never calls DocGen.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
const url = new URL(process.env.DATABASE_URL || "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  throw new Error("Bootstrap template hanya boleh dijalankan pada database lokal.");
}

const templates = {
  quotation: {
    file: "penawaran-docgen.html",
    provider: "local_qa:QUOTATION",
    config: {
      title: "SURAT PENAWARAN",
      opening: "Dengan hormat, berikut kami sampaikan penawaran untuk kebutuhan Anda.",
      footer: "Dokumen ini diterbitkan secara elektronik oleh Anugrah Plastik.",
      signatureLabel: "Hormat kami,",
      validityDays: 7,
      freight: "Disepakati terpisah.",
      payment: "Uang muka 50%; pelunasan 50% setelah barang diterima.",
      leadTime: "Pengerjaan dimulai setelah PO dan uang muka diterima.",
      notes: "Drawing dan spesifikasi yang dilampirkan menjadi bagian dari penawaran ini.",
    },
  },
  invoice: {
    file: "invoice-resmi-docgen.html",
    provider: "local_qa:INVOICE",
    config: {
      title: "INVOICE",
      opening: "Berikut rincian tagihan untuk pekerjaan yang telah disepakati.",
      footer: "Mohon cantumkan nomor invoice saat melakukan konfirmasi pembayaran.",
      signatureLabel: "Hormat kami,",
      paymentTerms: "Pembayaran paling lambat pada tanggal jatuh tempo.",
      footerNote: "Konfirmasi pembayaran melalui kontak resmi Anugrah Plastik.",
    },
  },
  delivery: {
    file: "surat-jalan-docgen.html",
    provider: "local_qa:DELIVERY",
    config: {
      title: "SURAT JALAN",
      opening: "Mohon periksa barang dan kemasan pada saat penerimaan.",
      footer: "Nama tercetak bukan tanda tangan atau bukti penerimaan. Bukti terima dicatat melalui STB.",
      signatureLabel: "Penerima",
      receiptInstruction: "Periksa jumlah dan kondisi barang sebelum menandatangani dokumen penerimaan.",
      notes: "Laporkan selisih atau kerusakan kepada PIC transaksi.",
    },
  },
  handover: {
    file: "bast-docgen.html",
    provider: "local_qa:BAST",
    config: {
      title: "SURAT TERIMA BARANG",
      opening: "Dokumen ini mencatat penyerahan dan penerimaan barang.",
      footer: "Nama tercetak bukan tanda tangan. Unggah salinan bertanda tangan sebagai bukti penerimaan.",
      signatureLabel: "Penerima",
      acceptanceStatement: "Barang telah diperiksa berdasarkan jumlah dan kondisi yang tercantum.",
      conditionNotes: "Catat setiap selisih, kerusakan, atau tindak lanjut yang diperlukan.",
    },
  },
};

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  for (const [kind, template] of Object.entries(templates)) {
    const current = await client.query("select active_version_id from document_template_catalogs where kind = $1", [
      kind,
    ]);
    if (current.rows[0]?.active_version_id) continue;
    const html = await readFile(`docs/templates/${template.file}`, "utf8");
    const checksum = createHash("sha256").update(html).digest("hex");
    await client.query("begin");
    try {
      const inserted = await client.query(
        `insert into document_template_versions
          (kind, version, config, compiled_checksum, provider_template_id, status, activated_at)
         values ($1, 1, $2::jsonb, $3, $4, 'active', now()) returning id`,
        [kind, JSON.stringify(template.config), checksum, template.provider],
      );
      await client.query(
        "update document_template_catalogs set active_version_id = $2, updated_at = now() where kind = $1",
        [kind, inserted.rows[0].id],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  process.stdout.write("Empat template dokumen lokal aktif.\n");
} finally {
  await client.end();
}
