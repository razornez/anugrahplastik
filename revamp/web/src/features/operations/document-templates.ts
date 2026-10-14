import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/lib/database/client";
import {
  documentTemplateCatalogs,
  documentTemplateVersions,
  emailTemplates,
  emailTemplateVersions,
} from "@/lib/database/schema";
import { localQaRendererEnabled, type DocGenTemplateKind } from "./docgen-policy";
import { documentTemplateKinds, documentTemplateLabels, type DocumentTemplateKind } from "./document-template-shared";
import { defaultEmailShellConfig, parseEmailShellConfig } from "@/features/integrations/email-template-shell";

export { documentTemplateKinds, documentTemplateLabels, type DocumentTemplateKind } from "./document-template-shared";

const common = {
  title: z.string().trim().min(3).max(90),
  opening: z.string().trim().max(600),
  footer: z.string().trim().min(3).max(700),
  signatureLabel: z.string().trim().min(2).max(80),
};

export const documentTemplateSchemas = {
  quotation: z.object({
    ...common,
    validityDays: z.coerce.number().int().min(1).max(365),
    freight: z.string().trim().min(2).max(500),
    payment: z.string().trim().min(2).max(700),
    leadTime: z.string().trim().min(2).max(700),
    notes: z.string().trim().max(1000),
  }),
  invoice: z.object({
    ...common,
    paymentTerms: z.string().trim().min(2).max(700),
    footerNote: z.string().trim().max(700),
  }),
  delivery: z.object({
    ...common,
    receiptInstruction: z.string().trim().min(2).max(700),
    notes: z.string().trim().max(1000),
  }),
  handover: z.object({
    ...common,
    acceptanceStatement: z.string().trim().min(2).max(700),
    conditionNotes: z.string().trim().max(1000),
  }),
} satisfies Record<DocumentTemplateKind, z.ZodType<Record<string, unknown>>>;

export type DocumentTemplateConfig = z.infer<(typeof documentTemplateSchemas)[DocumentTemplateKind]>;

export const defaultDocumentTemplateConfigs: Record<DocumentTemplateKind, Record<string, string | number>> = {
  quotation: {
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
  invoice: {
    title: "INVOICE",
    opening: "Berikut rincian tagihan untuk pekerjaan yang telah disepakati.",
    footer: "Mohon cantumkan nomor invoice saat melakukan konfirmasi pembayaran.",
    signatureLabel: "Hormat kami,",
    paymentTerms: "Pembayaran paling lambat pada tanggal jatuh tempo.",
    footerNote: "Konfirmasi pembayaran melalui kontak resmi Anugrah Plastik.",
  },
  delivery: {
    title: "SURAT JALAN",
    opening: "Mohon periksa barang dan kemasan pada saat penerimaan.",
    footer: "Nama tercetak bukan tanda tangan atau bukti penerimaan. Bukti terima dicatat melalui STB.",
    signatureLabel: "Penerima",
    receiptInstruction: "Periksa jumlah dan kondisi barang sebelum menandatangani dokumen penerimaan.",
    notes: "Laporkan selisih atau kerusakan kepada PIC transaksi.",
  },
  handover: {
    title: "SURAT TERIMA BARANG",
    opening: "Dokumen ini mencatat penyerahan dan penerimaan barang.",
    footer: "Nama tercetak bukan tanda tangan. Unggah salinan bertanda tangan sebagai bukti penerimaan.",
    signatureLabel: "Penerima",
    acceptanceStatement: "Barang telah diperiksa berdasarkan jumlah dan kondisi yang tercantum.",
    conditionNotes: "Catat setiap selisih, kerusakan, atau tindak lanjut yang diperlukan.",
  },
};

const sourceFiles: Record<DocumentTemplateKind, string> = {
  quotation: "penawaran-docgen.html",
  invoice: "invoice-resmi-docgen.html",
  delivery: "surat-jalan-docgen.html",
  handover: "bast-docgen.html",
};

const docGenKinds: Record<DocumentTemplateKind, DocGenTemplateKind> = {
  quotation: "QUOTATION",
  invoice: "INVOICE",
  delivery: "DELIVERY",
  handover: "BAST",
};

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function placeholderContract(html: string) {
  return [...new Set([...html.matchAll(/{{{?\s*([a-zA-Z0-9_.]+)\s*}?}}/g)].map((match) => match[1]))].sort();
}

export async function compileDocumentTemplate(kind: DocumentTemplateKind, input: unknown) {
  const config = documentTemplateSchemas[kind].parse(input) as Record<string, string | number>;
  const database = getDatabase();
  const [layout] = database
    ? await database
        .select({ shellConfig: emailTemplateVersions.shellConfig })
        .from(emailTemplates)
        .innerJoin(emailTemplateVersions, eq(emailTemplateVersions.templateId, emailTemplates.id))
        .where(and(eq(emailTemplates.templateKey, "layout"), eq(emailTemplates.isArchived, false)))
        .orderBy(desc(emailTemplateVersions.version))
        .limit(1)
    : [];
  const sharedShell = parseEmailShellConfig(layout?.shellConfig ?? defaultEmailShellConfig);
  const original = await readFile(resolve(process.cwd(), "docs/templates", sourceFiles[kind]), "utf8");
  const originalFooter = original.match(/<footer>([\s\S]*?)<\/footer>/)?.[1].trim() ?? "";
  const opening = `<p class="document-template-opening">${escapeHtml(config.opening)}</p>`;
  const accents = { blue: "#0b5fbe", sky: "#087ea4", gold: "#9a6700" } as const;
  const accent = accents[sharedShell.accent];
  const sharedCss =
    ".document-template-opening{margin:0 0 14px;line-height:1.55}" +
    "@media screen{body{padding:17mm 5mm 19mm!important}}" +
    "header{background:#102b49!important;border-bottom:4px solid " +
    accent +
    "!important;border-radius:10px 10px 0 0;color:#fff!important;padding:18px 20px!important;min-height:76px}" +
    "header .brand{align-items:center!important;gap:14px!important}" +
    "header .brand img{display:block!important;width:52px!important;height:52px!important;max-height:52px!important;object-fit:contain!important}" +
    "header .brand strong,header .brand-name{color:#fff!important;font-size:15px!important;letter-spacing:.02em!important}" +
    "header .brand small,header .brand-meta{color:#c9d9ea!important;font-size:8px!important;letter-spacing:.08em!important}" +
    "header .document-title,header .document-number,header .doc-title h1,header .doc-title p{color:#fff!important}" +
    "footer{border-top-color:" +
    accent +
    "!important}" +
    ".document-title,.doc-title h1,.title h1,.title strong{color:" +
    accent +
    "!important}";
  let compiled = original.replace("</style>", sharedCss + "</style>");
  compiled = compiled.replace(
    /Spesialis injeksi plastik, spare part, rubber, logam, dan lain-lain/g,
    escapeHtml(sharedShell.tagline),
  );
  const titles: Record<DocumentTemplateKind, RegExp> = {
    quotation: /<div class="letter-title">[\s\S]*?<\/div>/,
    invoice: /<h1>[\s\S]*?<\/h1>/,
    delivery: /<h1>[\s\S]*?<\/h1>/,
    handover: /<h1>[\s\S]*?<\/h1>/,
  };
  const titleTag =
    kind === "quotation"
      ? `<div class="letter-title">${escapeHtml(config.title)}</div>`
      : `<h1>${escapeHtml(config.title)}</h1>`;
  compiled = compiled.replace(titles[kind], `${opening}${titleTag}`);
  compiled = compiled.replace(
    /<footer>[\s\S]*?<\/footer>/,
    "<footer>" +
      escapeHtml(config.footer) +
      "<br />" +
      escapeHtml(sharedShell.footerText) +
      " · " +
      escapeHtml(sharedShell.contactEmail) +
      (originalFooter ? "<br />" + originalFooter : "") +
      "</footer>",
  );
  if (kind === "quotation") compiled = compiled.replace("Hormat kami,", escapeHtml(config.signatureLabel));
  const before = placeholderContract(original);
  const after = placeholderContract(compiled);
  if (before.join("|") !== after.join("|")) throw new Error("Kontrak variabel dokumen berubah.");
  if (/<script\b|javascript:|on[a-z]+\s*=/i.test(compiled)) throw new Error("Konten dokumen tidak aman.");
  return { config, html: compiled, checksum: createHash("sha256").update(compiled).digest("hex") };
}

export async function getDocumentTemplateState(kind: DocumentTemplateKind) {
  const database = getDatabase();
  if (!database) return { kind, active: null, versions: [] };
  const [catalog] = await database
    .select()
    .from(documentTemplateCatalogs)
    .where(eq(documentTemplateCatalogs.kind, kind))
    .limit(1);
  const versions = await database
    .select()
    .from(documentTemplateVersions)
    .where(eq(documentTemplateVersions.kind, kind))
    .orderBy(desc(documentTemplateVersions.version))
    .limit(12);
  return { kind, active: versions.find((item) => item.id === catalog?.activeVersionId) ?? null, versions };
}

export async function getActiveDocumentTemplate(kind: DocumentTemplateKind) {
  const database = getDatabase();
  if (!database) return null;
  const [row] = await database
    .select({ version: documentTemplateVersions })
    .from(documentTemplateCatalogs)
    .innerJoin(documentTemplateVersions, eq(documentTemplateCatalogs.activeVersionId, documentTemplateVersions.id))
    .where(and(eq(documentTemplateCatalogs.kind, kind), eq(documentTemplateVersions.status, "active")))
    .limit(1);
  return row?.version ?? null;
}

export async function resolveDocumentProviderTemplateId(kind: DocumentTemplateKind, fallback?: string) {
  const active = await getActiveDocumentTemplate(kind);
  return active?.providerTemplateId ?? fallback;
}

async function publishToDocGen(kind: DocumentTemplateKind, version: number, html: string) {
  if (localQaRendererEnabled() || process.env.NODE_ENV !== "production") {
    return `local_qa:${docGenKinds[kind]}`;
  }
  const apiKey = process.env.DOCGEN_API_KEY;
  if (!apiKey) throw new Error("Kunci DocGen belum tersedia.");
  const name = `${documentTemplateLabels[kind]} Resmi · v${version} · ${new Date().toISOString()}`;
  const response = await fetch("https://docgen.razornez.net/v1/templates", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ name, category: "Anugrah Plastik", body: html, schema: {} }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { template?: { id?: string } } | null;
  const id = payload?.template?.id;
  if (!response.ok || !id?.startsWith("tpl_")) throw new Error("Template belum dapat diterbitkan ke DocGen.");
  const preview = await fetch(`https://docgen.razornez.net/v1/templates/${id}/preview`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ data: anonymousSmokeData(kind, html) }),
    cache: "no-store",
  });
  const rendered = await preview.text();
  if (!preview.ok || rendered.includes("{{") || !rendered.includes("ANUGRAH")) {
    throw new Error("Smoke render DocGen belum lolos.");
  }
  await smokeRenderPdf({ apiKey, kind, version, templateId: id, data: anonymousSmokeData(kind, html) });
  return id;
}

async function smokeRenderPdf(input: {
  apiKey: string;
  kind: DocumentTemplateKind;
  version: number;
  templateId: string;
  data: Record<string, string | boolean>;
}) {
  const headers = { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" };
  const operationKey = `template-smoke-${input.kind}-v${input.version}-${randomUUID()}`;
  const response = await fetch("https://docgen.razornez.net/v1/batches", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": operationKey },
    body: JSON.stringify({
      template: input.templateId,
      items: [{ ref: operationKey, data: input.data }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 402 ? "Kredit DocGen tidak cukup untuk smoke render." : "Smoke PDF DocGen gagal dimulai.",
    );
  }
  const batch = (await response.json().catch(() => null)) as { id?: string } | null;
  if (!batch?.id?.startsWith("batch_")) throw new Error("Jawaban smoke PDF DocGen tidak valid.");

  let outputUrl: string | null = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const status = await fetch(`https://docgen.razornez.net/v1/batches/${batch.id}/documents`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!status.ok) throw new Error("Status smoke PDF DocGen belum dapat diperiksa.");
    const listing = (await status.json().catch(() => null)) as {
      data?: Array<{ status?: string; output_url?: string | null }>;
    } | null;
    const document = listing?.data?.[0];
    if (document?.status === "failed") throw new Error("Smoke PDF DocGen gagal dirender.");
    if (document?.status === "completed" && document.output_url) {
      outputUrl = document.output_url;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!outputUrl) throw new Error("Smoke PDF DocGen melewati batas waktu.");

  const url = new URL(outputUrl);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "docgen.razornez.net" &&
      url.hostname !== "files.docgen.id" &&
      !url.hostname.endsWith(".docgen.id"))
  ) {
    throw new Error("Alamat smoke PDF DocGen tidak diizinkan.");
  }
  const pdf = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  const buffer = Buffer.from(await pdf.arrayBuffer());
  if (
    !pdf.ok ||
    buffer.length < 5 ||
    buffer.length > 15 * 1024 * 1024 ||
    buffer.subarray(0, 5).toString() !== "%PDF-"
  ) {
    throw new Error("Hasil smoke DocGen bukan PDF yang valid.");
  }
}

function anonymousSmokeData(kind: DocumentTemplateKind, html: string): Record<string, string | boolean> {
  const data: Record<string, string | boolean> = { isDummy: false, isPreview: true };
  for (const key of placeholderContract(html)) data[key] = "Belum tersedia";
  data.penerbit = "CV. ANUGRAHPLASTIK MANDIRI BANDUNG";
  data.logo =
    kind === "invoice"
      ? '<img src="/brand/quotation-logo.png" alt="Logo Anugrah Plastik" width="52" height="52" />'
      : "/brand/quotation-logo.png";
  data.nama_pelanggan = "PT PELANGGAN CONTOH";
  data.penerima = "PENERIMA CONTOH";
  data.pic_penerima = "Ibu Dewi";
  data.alamat_penerima = "Jl. Industri Contoh No. 10, Bandung";
  data.alamat_pelanggan = "Jl. Industri Contoh No. 10, Bandung";
  data.alamat = "Jl. Industri Contoh No. 10, Bandung";
  data.alamat_penerbit = "Bandung, Jawa Barat";
  data.email_penerbit = "cs@anugrahplastik.com";
  data.telepon_penerbit = "0812 2339 587";
  data.situs_penerbit = "anugrahplastik.com";
  data.tanggal = "14 Oktober 2026";
  data.baris_barang =
    "<tr><td>1</td><td>Barang contoh</td><td>1 pcs</td><td>Belum tersedia</td><td>Rp1.000</td><td>Rp1.000</td><td>Belum tersedia</td></tr>";
  const source = defaultDocumentTemplateConfigs[kind];
  Object.keys(source).forEach((key) => (data[key] = String(source[key])));
  return data;
}

function renderPreviewHtml(template: string, data: Record<string, string | boolean>) {
  let rendered = template.replace(/{{#if\s+([a-zA-Z0-9_.]+)}}([\s\S]*?){{\/if}}/g, (_, key: string, body: string) =>
    data[key] ? body : "",
  );
  rendered = rendered.replace(/{{{\s*([a-zA-Z0-9_.]+)\s*}}}/g, (_, key: string) =>
    String(data[key] ?? "Belum tersedia"),
  );
  rendered = rendered.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_, key: string) =>
    escapeHtml(data[key] ?? "Belum tersedia"),
  );
  return rendered;
}

export async function renderAnonymousDocumentPreview(kind: DocumentTemplateKind, input: unknown) {
  const compiled = await compileDocumentTemplate(kind, input);
  const html = renderPreviewHtml(compiled.html, anonymousSmokeData(kind, compiled.html));
  if (html.includes("{{")) throw new Error("Pratinjau masih memiliki variabel yang belum dirender.");
  return html;
}

export async function activateDocumentTemplate(input: {
  kind: DocumentTemplateKind;
  config: unknown;
  actorId: string;
  restoredFromId?: string;
}) {
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const compiled = await compileDocumentTemplate(input.kind, input.config);
  const [latest] = await database
    .select({ version: documentTemplateVersions.version })
    .from(documentTemplateVersions)
    .where(eq(documentTemplateVersions.kind, input.kind))
    .orderBy(desc(documentTemplateVersions.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;
  const [pending] = await database
    .insert(documentTemplateVersions)
    .values({
      kind: input.kind,
      version,
      config: compiled.config,
      compiledChecksum: compiled.checksum,
      createdBy: input.actorId,
      restoredFromId: input.restoredFromId,
    })
    .returning({ id: documentTemplateVersions.id });
  if (!pending) throw new Error("Versi dokumen tidak dapat dibuat.");
  try {
    const providerTemplateId = await publishToDocGen(input.kind, version, compiled.html);
    await database.transaction(async (tx) => {
      await tx
        .update(documentTemplateVersions)
        .set({ status: "active", providerTemplateId, activatedAt: new Date() })
        .where(eq(documentTemplateVersions.id, pending.id));
      await tx
        .insert(documentTemplateCatalogs)
        .values({ kind: input.kind, activeVersionId: pending.id })
        .onConflictDoUpdate({
          target: documentTemplateCatalogs.kind,
          set: { activeVersionId: pending.id, updatedAt: new Date() },
        });
    });
    return { id: pending.id, version, providerTemplateId };
  } catch (error) {
    await database
      .update(documentTemplateVersions)
      .set({ status: "failed", failureCode: error instanceof Error ? error.message.slice(0, 80) : "publish_failed" })
      .where(eq(documentTemplateVersions.id, pending.id));
    throw error;
  }
}

export async function republishActiveDocumentTemplates(actorId: string) {
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const prepared: Array<{
    id: string;
    kind: DocumentTemplateKind;
    version: number;
    html: string;
  }> = [];
  const activeTemplates = await Promise.all(documentTemplateKinds.map((kind) => getActiveDocumentTemplate(kind)));
  const missingIndex = activeTemplates.findIndex((template) => !template);
  if (missingIndex >= 0)
    throw new Error(documentTemplateLabels[documentTemplateKinds[missingIndex]] + " belum memiliki versi aktif.");
  for (const [index, kind] of documentTemplateKinds.entries()) {
    const active = activeTemplates[index]!;
    const compiled = await compileDocumentTemplate(kind, active.config);
    const [latest] = await database
      .select({ version: documentTemplateVersions.version })
      .from(documentTemplateVersions)
      .where(eq(documentTemplateVersions.kind, kind))
      .orderBy(desc(documentTemplateVersions.version))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;
    const [pending] = await database
      .insert(documentTemplateVersions)
      .values({
        kind,
        version,
        config: compiled.config,
        compiledChecksum: compiled.checksum,
        createdBy: actorId,
        restoredFromId: active.id,
      })
      .returning({ id: documentTemplateVersions.id });
    if (!pending) throw new Error(documentTemplateLabels[kind] + " tidak dapat disiapkan.");
    prepared.push({ id: pending.id, kind, version, html: compiled.html });
  }
  try {
    const published: Array<{
      id: string;
      kind: DocumentTemplateKind;
      version: number;
      html: string;
      providerTemplateId: string;
    }> = [];
    for (const item of prepared) {
      const providerTemplateId = await publishToDocGen(item.kind, item.version, item.html);
      published.push({ ...item, providerTemplateId });
    }
    await database.transaction(async (tx) => {
      for (const item of published) {
        await tx
          .update(documentTemplateVersions)
          .set({ status: "active", providerTemplateId: item.providerTemplateId, activatedAt: new Date() })
          .where(eq(documentTemplateVersions.id, item.id));
        await tx
          .insert(documentTemplateCatalogs)
          .values({ kind: item.kind, activeVersionId: item.id })
          .onConflictDoUpdate({
            target: documentTemplateCatalogs.kind,
            set: { activeVersionId: item.id, updatedAt: new Date() },
          });
      }
    });
    return published;
  } catch (error) {
    await database.transaction(async (tx) => {
      for (const item of prepared) {
        await tx
          .update(documentTemplateVersions)
          .set({ status: "failed", failureCode: "shared_shell_publish_failed" })
          .where(eq(documentTemplateVersions.id, item.id));
      }
    });
    throw error;
  }
}

export function parseDocumentTemplateForm(kind: DocumentTemplateKind, formData: FormData) {
  const values = Object.fromEntries(
    Object.keys(documentTemplateSchemas[kind].shape).map((key) => [key, String(formData.get(key) ?? "").trim()]),
  );
  return documentTemplateSchemas[kind].safeParse(values);
}

export function documentTemplateFormId() {
  return randomUUID();
}
