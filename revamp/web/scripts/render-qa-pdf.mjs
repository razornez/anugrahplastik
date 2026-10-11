// Private local QA worker. Fixed templates only; no API client or credentials.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.NODE_ENV !== "development" || process.env.DOCGEN_RENDER_MODE !== "local_qa") {
  throw new Error("Local QA renderer is disabled.");
}
const templates = {
  "local_qa:QUOTATION": "penawaran-docgen.html",
  "local_qa:INVOICE": "invoice-resmi-docgen.html",
  "local_qa:DELIVERY": "surat-jalan-docgen.html",
  "local_qa:BAST": "bast-docgen.html",
};
const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 2 * 1024 * 1024) throw new Error("QA payload exceeds limit.");
  chunks.push(chunk);
}
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const template = templates[input.templateId];
if (!template) throw new Error("Unknown QA template.");
const { renderHtml, PdfRenderer } = await import(
  pathToFileURL(resolve("../../../docgen/packages/renderer/dist/index.js")).href
);
const html = renderHtml(await readFile(resolve("docs/templates", template), "utf8"), {
  ...input.data,
  isDummy: true,
  isPreview: true,
});
const renderer = new PdfRenderer();
try {
  const { pdf } = await renderer.render(html);
  process.stdout.write(pdf);
} finally {
  await renderer.close();
}
