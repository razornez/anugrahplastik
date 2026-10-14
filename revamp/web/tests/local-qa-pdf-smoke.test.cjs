/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { mkdir, writeFile } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { PDFDocument } = require("pdf-lib");

const templates = [
  ["QUOTATION", "penawaran-docgen.html"],
  ["INVOICE", "invoice-resmi-docgen.html"],
  ["DELIVERY", "surat-jalan-docgen.html"],
  ["BAST", "bast-docgen.html"],
];
const logo = `data:image/png;base64,${readFileSync(resolve("public/brand/quotation-logo.png")).toString("base64")}`;

function anonymousData(kind, html) {
  const data = { isDummy: false, isPreview: true };
  for (const [, key] of html.matchAll(/{{{?\s*([a-zA-Z0-9_.]+)\s*}?}}/g)) data[key] = "—";
  Object.assign(data, {
    penerbit: "CV. ANUGRAHPLASTIK MANDIRI BANDUNG",
    logo: kind === "INVOICE" ? `<img src="${logo}" alt="Logo Anugrah Plastik" width="52" height="52" />` : logo,
    tanggal: "14 Oktober 2026",
    nama_pelanggan: "PT PELANGGAN CONTOH",
    penerima: "PT PELANGGAN CONTOH",
    pic_penerima: "Ibu Dewi",
    alamat_pelanggan: "Jl. Industri Contoh No. 10, Bandung",
    alamat_penerima: "Jl. Industri Contoh No. 10, Bandung",
    alamat_penerbit: "Bandung, Jawa Barat",
    telepon_penerbit: "0812 2339 587",
    email_penerbit: "cs@anugrahplastik.com",
    situs_penerbit: "anugrahplastik.com",
    baris_barang: "<tr><td>1</td><td>Barang contoh</td><td>1 pcs</td><td>Rp1.000</td><td>Rp1.000</td></tr>",
  });
  return data;
}

function render(templateId, data) {
  return new Promise((resolvePdf, reject) => {
    const child = spawn(process.execPath, [resolve("scripts/render-qa-pdf.mjs")], {
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        NODE_ENV: "development",
        DOCGEN_RENDER_MODE: "local_qa",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const chunks = [];
    let errorText = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => {
      errorText += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`Renderer QA gagal: ${errorText.slice(0, 300)}`));
      else resolvePdf(Buffer.concat(chunks));
    });
    child.stdin.end(JSON.stringify({ templateId, data }));
  });
}

test("four official local templates render anonymous PDFs without external services", async () => {
  for (const [kind, filename] of templates) {
    const html = readFileSync(resolve("docs/templates", filename), "utf8");
    const bytes = await render(`local_qa:${kind}`, anonymousData(kind, html));
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= 1, `${kind} has a page`);
    if (process.env.KEEP_PDF_SMOKE === "1") {
      const output = resolve("tmp/pdfs");
      await mkdir(output, { recursive: true });
      await writeFile(join(output, `${kind.toLowerCase()}-smoke.pdf`), bytes);
    }
  }
});
