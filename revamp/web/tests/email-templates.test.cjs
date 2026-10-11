/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Node test loads a TypeScript module without starting Next. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const filename = join(__dirname, "../src/features/integrations/email-templates.ts");
const shellFilename = join(__dirname, "../src/features/integrations/email-template-shell.ts");
const editorFilename = join(__dirname, "../src/components/email-template-settings-editor.tsx");
const restoreFilename = join(__dirname, "../src/components/email-template-restore-button.tsx");
const shell = new Module(shellFilename, module);
shell.filename = shellFilename;
shell.paths = module.paths;
shell._compile(
  ts.transpileModule(readFileSync(shellFilename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  shellFilename,
);
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded.require = (name) => {
  if (name === "server-only") return {};
  if (name === "./email-template-shell") return shell.exports;
  if (name === "@/lib/database/client") return { getDatabase: () => null };
  if (name === "@/lib/database/schema" || name === "@/features/operations/private-storage") return {};
  return require(name);
};
loaded._compile(
  ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  filename,
);
const {
  buildBrandedEmailDocument,
  buildTemplatedEmail,
  defaultEmailShellConfig,
  defaultTemplate,
  parseEmailShellConfig,
  validateEmailDoc,
  validateEmailShellConfig,
  renderEmailDocument,
} = loaded.exports;

test("template default menyediakan tata letak dan pesan tanpa HTML bebas", () => {
  assert.doesNotThrow(() => validateEmailDoc(defaultTemplate("layout").content, "layout"));
  assert.doesNotThrow(() => validateEmailDoc(defaultTemplate("quotation").content, "quotation"));
  assert.throws(() => validateEmailDoc({ type: "doc", content: [{ type: "script", text: "alert(1)" }] }, "new"));
});

test("gambar dan tautan tidak sah ditolak di server", () => {
  assert.throws(() =>
    validateEmailDoc(
      { type: "doc", content: [{ type: "image", attrs: { src: "https://tracker.example/pixel.png" } }] },
      "new",
    ),
  );
  assert.throws(() =>
    validateEmailDoc(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Klik", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
            ],
          },
        ],
      },
      "new",
    ),
  );
  assert.throws(() =>
    validateEmailDoc(
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "{{secrets}}" }] }] },
      "new",
    ),
  );
  assert.throws(() =>
    validateEmailDoc(
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "{{customerName}" }] }] },
      "new",
    ),
  );
  assert.throws(() =>
    validateEmailDoc(
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "{{customerName}}" }] }] },
      "reply",
    ),
  );
});

test("teks customer di-escape dan teks biasa tetap tersedia", async () => {
  const content = validateEmailDoc(
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Halo {{customerName}}" }] }] },
    "quotation",
  );
  const result = await renderEmailDocument(content, { customerName: '<img src=x onerror="alert(1)">' });
  assert.match(result.html, /&lt;img/);
  assert.doesNotMatch(result.html, /<img\b/i);
  assert.match(result.text, /Halo <img/);
});

test("tata letak hanya boleh punya satu slot isi tanpa format", () => {
  assert.throws(() =>
    validateEmailDoc(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "{{message}}" },
              { type: "text", text: "{{message}}" },
            ],
          },
        ],
      },
      "layout",
    ),
  );
});

test("email operasional selalu memakai shell Anugrah Plastik dan logo CID privat", async () => {
  const result = await buildTemplatedEmail(
    defaultTemplate("delivery").content,
    {
      customerName: "PT Contoh Pelanggan",
      transactionNo: "SJ-2026-0001",
      documentName: "Surat jalan",
      senderName: "Tim Anugrah Plastik",
    },
    "delivery",
  );
  const layoutPreview = await buildBrandedEmailDocument(defaultTemplate("layout").content, {
    message: "Contoh isi pesan.",
  });

  assert.match(result.html, /ANUGRAH PLASTIK/);
  assert.match(result.html, /cid:brand-logo@anugrahplastik\.com/);
  assert.ok(result.attachments.some((attachment) => attachment.cid === "brand-logo@anugrahplastik.com"));
  assert.match(layoutPreview.html, /ANUGRAH PLASTIK/);
});

test("shell email lama memakai Korporat Navy dan konfigurasi baru tetap dibatasi", async () => {
  assert.deepEqual(parseEmailShellConfig(null), defaultEmailShellConfig);
  assert.throws(() => validateEmailShellConfig({ preset: "corporate-navy", accent: "purple" }));
  const result = await buildBrandedEmailDocument(
    defaultTemplate("layout").content,
    { message: "Contoh isi pesan." },
    {
      preset: "corporate-navy",
      accent: "gold",
      companyName: "Anugrah Plastik Utama",
      tagline: "KEMASAN · BANDUNG",
      contactEmail: "layanan@anugrahplastik.com",
      footerText: "Kami siap membantu kebutuhan plastik Anda.",
    },
  );
  assert.match(result.html, /Anugrah Plastik Utama/);
  assert.match(result.html, /#b7791f/);
  assert.match(result.html, /layanan@anugrahplastik\.com/);
});

test("workspace template memakai preview tertunda dan dialog aktivasi aplikasi", () => {
  const editor = readFileSync(editorFilename, "utf8");
  const restore = readFileSync(restoreFilename, "utf8");
  assert.match(editor, /window\.setTimeout\(\(\) => void refreshPreview\(\), 600\)/);
  assert.match(editor, /<Dialog\.Root/);
  assert.match(editor, /PreviewState/);
  assert.match(editor, /Tampilan email/);
  assert.match(editor, /shellConfig/);
  assert.doesNotMatch(editor, /window\.confirm|window\.alert/);
  assert.match(restore, /<Dialog\.Root/);
  assert.doesNotMatch(restore, /window\.confirm|window\.alert/);
});
