/* eslint-disable @typescript-eslint/no-require-imports -- Node test fixture loads TypeScript without a build. */
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { PDFDocument } = require("pdf-lib");
const ts = require("typescript");

function load(relativePath, privateRoot) {
  const filename = join(__dirname, relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = (name) =>
    name === "./private-storage" ? { privateFilePath: (value) => join(privateRoot, value) } : require(name);
  loaded._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
  return loaded.exports;
}

test("PDF dan foto dipasang sesuai urutan, checksum diperiksa, dan halaman dummy diberi penanda", async () => {
  const root = await mkdtemp(join(tmpdir(), "quote-attachment-test-"));
  try {
    const { appendQuotationAttachments } = load("../src/features/operations/quotation-attachments.ts", root);
    const base = await PDFDocument.create();
    base.addPage([595, 842]);
    const appendix = await PDFDocument.create();
    appendix.addPage([595, 842]);
    const pdfBytes = Buffer.from(await appendix.save());
    const photoBytes = await readFile(join(__dirname, "../public/brand/quotation-logo.png"));
    await writeFile(join(root, "drawing.pdf"), pdfBytes);
    await writeFile(join(root, "photo.png"), photoBytes);
    const attachments = [
      {
        id: "a",
        originalName: "drawing.pdf",
        storagePath: "drawing.pdf",
        checksum: createHash("sha256").update(pdfBytes).digest("hex"),
        category: "Drawing",
        caption: "Drawing uji",
      },
      {
        id: "b",
        originalName: "photo.png",
        storagePath: "photo.png",
        checksum: createHash("sha256").update(photoBytes).digest("hex"),
        category: "Foto produk",
        caption: "Foto uji – produk 🧰",
      },
    ];
    const merged = await appendQuotationAttachments(Buffer.from(await base.save()), attachments, true);
    assert.equal((await PDFDocument.load(merged)).getPageCount(), 3);
    await assert.rejects(
      appendQuotationAttachments(Buffer.from(await base.save()), [{ ...attachments[0], checksum: "wrong" }], true),
      /Checksum/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
