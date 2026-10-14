#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const confirmation = process.env.DOCUMENT_TEMPLATE_RELEASE_CONFIRM;
const connectionString = process.env.DATABASE_URL;
const apiKey = process.env.DOCGEN_API_KEY;

if (confirmation !== "publish-official-v1") {
  console.error("Refusing to publish without DOCUMENT_TEMPLATE_RELEASE_CONFIRM=publish-official-v1.");
  process.exit(2);
}
if (!connectionString || !apiKey) {
  console.error("DATABASE_URL and DOCGEN_API_KEY must come from the root-only production environment.");
  process.exit(2);
}

const databaseUrl = new URL(connectionString);
if (["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) {
  console.error("The official publisher must not run against a local database.");
  process.exit(2);
}

const templates = {
  quotation: {
    label: "Penawaran Resmi",
    file: "penawaran-docgen.html",
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
    label: "Invoice Resmi",
    file: "invoice-resmi-docgen.html",
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
    label: "Surat Jalan Resmi",
    file: "surat-jalan-docgen.html",
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
    label: "STB Resmi",
    file: "bast-docgen.html",
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

const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

function placeholderContract(html) {
  return [...new Set([...html.matchAll(/{{{?\s*([a-zA-Z0-9_.]+)\s*}?}}/g)].map((match) => match[1]))].sort();
}

function anonymousData(html) {
  const data = { isDummy: false, isPreview: true };
  for (const key of placeholderContract(html)) data[key] = "Belum tersedia";
  data.penerbit = "CV. ANUGRAHPLASTIK MANDIRI BANDUNG";
  data.nama_pelanggan = "PT PELANGGAN CONTOH";
  data.penerima = "PENERIMA CONTOH";
  data.baris_barang =
    "<tr><td>1</td><td>Barang contoh</td><td>1 pcs</td><td>Belum tersedia</td><td>Rp1.000</td><td>Rp1.000</td><td>Belum tersedia</td></tr>";
  return data;
}

async function requestJson(url, options, message) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000), cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(response.status === 402 ? "Kredit DocGen tidak cukup." : message);
  return payload;
}

async function smokePdf(templateId, kind, html) {
  const operationKey = `official-template-${kind}-${randomUUID()}`;
  const batch = await requestJson(
    "https://docgen.razornez.net/v1/batches",
    {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": operationKey },
      body: JSON.stringify({ template: templateId, items: [{ ref: operationKey, data: anonymousData(html) }] }),
    },
    `Smoke PDF ${kind} gagal dimulai.`,
  );
  if (!batch?.id?.startsWith("batch_")) throw new Error(`Batch smoke ${kind} tidak valid.`);

  let outputUrl;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const listing = await requestJson(
      `https://docgen.razornez.net/v1/batches/${batch.id}/documents`,
      { headers },
      `Status smoke PDF ${kind} gagal dibaca.`,
    );
    const document = listing?.data?.[0];
    if (document?.status === "failed") throw new Error(`Smoke PDF ${kind} gagal dirender.`);
    if (document?.status === "completed" && document.output_url) {
      outputUrl = document.output_url;
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  if (!outputUrl) throw new Error(`Smoke PDF ${kind} melewati batas waktu.`);

  const url = new URL(outputUrl);
  const allowedHost =
    url.protocol === "https:" &&
    (url.hostname === "docgen.razornez.net" ||
      url.hostname === "files.docgen.id" ||
      url.hostname.endsWith(".docgen.id"));
  if (!allowedHost) throw new Error(`Alamat PDF ${kind} tidak diizinkan.`);
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    !response.ok ||
    bytes.length < 5 ||
    bytes.length > 15 * 1024 * 1024 ||
    bytes.subarray(0, 5).toString() !== "%PDF-"
  ) {
    throw new Error(`Hasil smoke ${kind} bukan PDF yang valid.`);
  }
}

async function publish(kind, template, html) {
  const created = await requestJson(
    "https://docgen.razornez.net/v1/templates",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: `${template.label} · initial · ${new Date().toISOString()}`,
        category: "Anugrah Plastik",
        body: html,
        schema: {},
      }),
    },
    `Template ${kind} gagal dibuat.`,
  );
  const templateId = created?.template?.id;
  if (!templateId?.startsWith("tpl_")) throw new Error(`ID template ${kind} tidak valid.`);
  const previewResponse = await fetch(`https://docgen.razornez.net/v1/templates/${templateId}/preview`, {
    method: "POST",
    headers,
    body: JSON.stringify({ data: anonymousData(html) }),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const preview = await previewResponse.text();
  if (!previewResponse.ok || preview.includes("{{") || !preview.includes("ANUGRAH")) {
    throw new Error(`Preview ${kind} tidak lolos.`);
  }
  await smokePdf(templateId, kind, html);
  return templateId;
}

const prepared = [];
for (const [kind, template] of Object.entries(templates)) {
  const html = await readFile(resolve(process.cwd(), "docs/templates", template.file), "utf8");
  if (/<script\b|javascript:|on[a-z]+\s*=/i.test(html)) throw new Error(`Template ${kind} tidak aman.`);
  const providerTemplateId = await publish(kind, template, html);
  prepared.push({
    kind,
    config: template.config,
    checksum: createHash("sha256").update(html).digest("hex"),
    providerTemplateId,
  });
  process.stdout.write(`${template.label}: smoke PDF lolos.\n`);
}

const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query("begin");
  const actor = await client.query(
    "select id from users where role = 'admin' and is_active = true order by created_at asc limit 1",
  );
  const actorId = actor.rows[0]?.id ?? null;
  for (const item of prepared) {
    await client.query("select kind from document_template_catalogs where kind = $1 for update", [item.kind]);
    const latest = await client.query(
      "select coalesce(max(version), 0)::integer as version from document_template_versions where kind = $1",
      [item.kind],
    );
    const version = latest.rows[0].version + 1;
    const inserted = await client.query(
      `insert into document_template_versions
        (kind, version, config, compiled_checksum, provider_template_id, status, created_by, activated_at)
       values ($1, $2, $3::jsonb, $4, $5, 'active', $6, now()) returning id`,
      [item.kind, version, JSON.stringify(item.config), item.checksum, item.providerTemplateId, actorId],
    );
    await client.query(
      `insert into document_template_catalogs (kind, active_version_id)
       values ($1, $2)
       on conflict (kind) do update set active_version_id = excluded.active_version_id, updated_at = now()`,
      [item.kind, inserted.rows[0].id],
    );
  }
  await client.query(
    `insert into audit_logs (actor_id, action, entity_type, entity_id, metadata)
     values ($1, 'document_templates.initial_release', 'document_template', 'official-v1', $2::jsonb)`,
    [
      actorId,
      JSON.stringify({
        kinds: prepared.map((item) => item.kind),
        checksums: Object.fromEntries(prepared.map((item) => [item.kind, item.checksum])),
      }),
    ],
  );
  await client.query("commit");
  process.stdout.write("Empat template resmi aktif dalam satu transaksi database.\n");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
