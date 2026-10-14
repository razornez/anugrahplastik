import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { localQaRendererEnabled } from "./docgen-policy";
import { compileDocumentTemplate, getActiveDocumentTemplate, type DocumentTemplateKind } from "./document-templates";

export async function renderLocalQaPdf(templateId: string, data: Record<string, string | boolean>) {
  if (!localQaRendererEnabled()) throw new Error("Renderer QA tidak aktif.");
  const kinds: Record<string, DocumentTemplateKind> = {
    "local_qa:QUOTATION": "quotation",
    "local_qa:INVOICE": "invoice",
    "local_qa:DELIVERY": "delivery",
    "local_qa:BAST": "handover",
  };
  const kind = kinds[templateId];
  const active = kind ? await getActiveDocumentTemplate(kind) : null;
  const templateHtml = kind && active ? (await compileDocumentTemplate(kind, active.config)).html : undefined;
  return new Promise<Buffer>((resolveResult, reject) => {
    // Do not pass DocGen/SMTP credentials to the isolated PDF worker.
    const child = spawn(process.execPath, [resolve("scripts/render-qa-pdf.mjs")], {
      windowsHide: true,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        NODE_ENV: "development",
        DOCGEN_RENDER_MODE: "local_qa",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    const timeout = setTimeout(() => child.kill(), 45_000);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 15 * 1024 * 1024) child.kill();
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const pdf = Buffer.concat(chunks);
      if (code !== 0 || size > 15 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== "%PDF-") {
        reject(new Error("Render PDF QA gagal; tidak ada dokumen resmi diterbitkan."));
      } else resolveResult(pdf);
    });
    child.stdin.end(JSON.stringify({ templateId, data, templateHtml }));
  });
}
