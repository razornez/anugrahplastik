import "server-only";
import { and, desc, eq } from "drizzle-orm";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDatabase } from "@/lib/database/client";
import { emailTemplateMedia, emailTemplates, emailTemplateVersions } from "@/lib/database/schema";
import { privateFilePath } from "@/features/operations/private-storage";
import { defaultEmailShellConfig, parseEmailShellConfig, type EmailShellConfig } from "./email-template-shell";

export {
  defaultEmailShellConfig,
  emailShellAccents,
  emailShellPresets,
  parseEmailShellConfig,
  validateEmailShellConfig,
  type EmailShellConfig,
} from "./email-template-shell";

export const templateKeys = ["layout", "new", "reply", "quotation", "invoice", "delivery", "handover"] as const;
export type TemplateKey = (typeof templateKeys)[number];
export type EmailNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: EmailNode[];
  content?: EmailNode[];
};
export const templateLabels: Record<TemplateKey, string> = {
  layout: "Tata letak bersama",
  new: "Pesan baru",
  reply: "Balasan",
  quotation: "Surat penawaran",
  invoice: "Invoice",
  delivery: "Surat jalan",
  handover: "STB",
};

const tokenNames = [
  "customerName",
  "transactionNo",
  "documentName",
  "senderName",
  "originalSubject",
  "message",
] as const;
const tokensByTemplate: Record<TemplateKey, readonly string[]> = {
  layout: ["message", "senderName"],
  new: ["senderName"],
  reply: ["originalSubject", "senderName"],
  quotation: ["customerName", "transactionNo", "documentName", "senderName"],
  invoice: ["customerName", "transactionNo", "documentName", "senderName"],
  delivery: ["customerName", "transactionNo", "documentName", "senderName"],
  handover: ["customerName", "transactionNo", "documentName", "senderName"],
};
const purifier = createDOMPurify(new JSDOM("").window);
const brandLogoCid = "brand-logo@anugrahplastik.com";

type EmailAttachment = { filename: string; content: Buffer; cid: string };

export function escapeEmailText(text: string) {
  return text.replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character,
  );
}

function doc(...content: EmailNode[]): EmailNode {
  return { type: "doc", content };
}

function paragraph(text: string): EmailNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

export function defaultTemplate(key: TemplateKey): { subject: string; content: EmailNode } {
  if (key === "layout")
    return {
      subject: "Tata letak Anugrah Plastik",
      content: doc(paragraph("{{message}}"), paragraph("Terima kasih telah menghubungi Anugrah Plastik.")),
    };
  if (key === "new")
    return {
      subject: "",
      content: doc(paragraph("Halo,"), paragraph("Tulis pesan di sini."), paragraph("Salam,\n{{senderName}}")),
    };
  if (key === "reply")
    return {
      subject: "Re: {{originalSubject}}",
      content: doc(
        paragraph("Halo,"),
        paragraph("Terima kasih telah menghubungi kami."),
        paragraph("Salam,\n{{senderName}}"),
      ),
    };
  return {
    subject: "{{documentName}} · {{transactionNo}}",
    content: doc(
      paragraph("Yth. {{customerName}},"),
      paragraph("Terlampir {{documentName}} untuk pekerjaan {{transactionNo}}."),
      paragraph("Salam,\n{{senderName}}"),
    ),
  };
}

export function validateEmailDoc(input: unknown, key: TemplateKey): EmailNode {
  const allowed = new Set([
    "doc",
    "paragraph",
    "heading",
    "text",
    "emailVariable",
    "hardBreak",
    "bulletList",
    "orderedList",
    "listItem",
    "blockquote",
    "table",
    "tableRow",
    "tableCell",
    "tableHeader",
    "image",
    "horizontalRule",
  ]);
  let nodes = 0;
  let images = 0;
  function visit(value: unknown, depth: number): EmailNode {
    if (!value || typeof value !== "object" || depth > 20 || ++nodes > 500)
      throw new Error("Struktur email terlalu panjang atau tidak valid.");
    const node = value as EmailNode;
    if (!allowed.has(node.type)) throw new Error("Format email tidak diizinkan.");
    if (node.type === "text") {
      if (typeof node.text !== "string" || node.text.length > 20_000) throw new Error("Teks email tidak valid.");
      for (const match of node.text.matchAll(/{{([^{}]+)}}/g))
        if (!tokenNames.includes(match[1] as (typeof tokenNames)[number]) || !tokensByTemplate[key].includes(match[1]))
          throw new Error(`Variabel {{${match[1]}}} tidak tersedia.`);
      if (/{{|}}/.test(node.text.replace(/{{([^{}]+)}}/g, "")))
        throw new Error("Penulisan variabel email belum lengkap.");
    }
    if (node.type === "emailVariable") {
      const token = String(node.attrs?.token ?? "");
      if (!tokenNames.includes(token as (typeof tokenNames)[number]) || !tokensByTemplate[key].includes(token))
        throw new Error(`Variabel {{${token}}} tidak tersedia.`);
      return { type: "emailVariable", attrs: { token } };
    }
    if (node.type === "image") {
      if (++images > 5) throw new Error("Maksimal lima gambar per email.");
      if (!/^\/api\/admin\/email-template-media\/[0-9a-f-]{36}$/.test(String(node.attrs?.src ?? "")))
        throw new Error("Gambar harus diunggah melalui editor.");
    }
    if (node.marks?.some((mark) => !["bold", "italic", "underline", "strike", "link"].includes(mark.type)))
      throw new Error("Gaya teks tidak diizinkan.");
    if (
      node.marks?.some((mark) => mark.type === "link" && !/^(https:\/\/|mailto:)/i.test(String(mark.attrs?.href ?? "")))
    )
      throw new Error("Tautan harus menggunakan HTTPS atau mailto.");
    return {
      type: node.type,
      ...(node.text === undefined ? {} : { text: node.text }),
      ...(node.attrs ? { attrs: node.attrs } : {}),
      ...(node.marks ? { marks: node.marks } : {}),
      ...(node.content ? { content: node.content.map((child) => visit(child, depth + 1)) } : {}),
    };
  }
  const result = visit(input, 0);
  if (result.type !== "doc" || !result.content?.length) throw new Error("Isi template tidak boleh kosong.");
  if (key === "layout") {
    const isMessage = (node: EmailNode) =>
      (node.type === "text" && node.text === "{{message}}" && !node.marks?.length) ||
      (node.type === "emailVariable" && node.attrs?.token === "message");
    const validSlot = result.content?.some(
      (part) => part.type === "paragraph" && part.content?.length === 1 && isMessage(part.content[0]),
    );
    let count = 0;
    const countSlots = (node: EmailNode) => {
      if (node.type === "text") count += node.text?.match(/{{message}}/g)?.length ?? 0;
      if (node.type === "emailVariable" && node.attrs?.token === "message") count += 1;
      node.content?.forEach(countSlots);
    };
    countSlots(result);
    if (!validSlot || count !== 1)
      throw new Error("Sisipkan {{message}} satu kali pada satu paragraf tersendiri tanpa format tambahan.");
  }
  return result;
}

export async function getActiveTemplate(key: TemplateKey, language = "id", requestedTemplateId?: string) {
  const database = getDatabase();
  const rows = database
    ? await database
        .select({ version: emailTemplateVersions, template: emailTemplates })
        .from(emailTemplateVersions)
        .innerJoin(emailTemplates, eq(emailTemplates.id, emailTemplateVersions.templateId))
        .where(
          and(
            eq(emailTemplates.templateKey, key),
            eq(emailTemplates.isArchived, false),
            requestedTemplateId ? eq(emailTemplates.id, requestedTemplateId) : eq(emailTemplates.isDefault, true),
            requestedTemplateId ? undefined : eq(emailTemplates.language, language),
          ),
        )
        .orderBy(desc(emailTemplateVersions.version))
        .limit(1)
    : [];
  let [row] = rows;
  let fallbackLanguage = false;
  if (!row && database && !requestedTemplateId && language !== "id") {
    [row] = await database
      .select({ version: emailTemplateVersions, template: emailTemplates })
      .from(emailTemplateVersions)
      .innerJoin(emailTemplates, eq(emailTemplates.id, emailTemplateVersions.templateId))
      .where(
        and(
          eq(emailTemplates.templateKey, key),
          eq(emailTemplates.language, "id"),
          eq(emailTemplates.isDefault, true),
          eq(emailTemplates.isArchived, false),
        ),
      )
      .orderBy(desc(emailTemplateVersions.version))
      .limit(1);
    fallbackLanguage = Boolean(row);
  }
  return row
    ? {
        ...row.version,
        templateId: row.template.id,
        templateName: row.template.name,
        language: row.template.language,
        fallbackLanguage,
        content: row.version.content as EmailNode,
        shellConfig: parseEmailShellConfig(row.version.shellConfig),
      }
    : {
        ...defaultTemplate(key),
        templateKey: key,
        templateId: null,
        templateName: templateLabels[key],
        language: "id",
        fallbackLanguage: language !== "id",
        version: 0,
        id: null,
        createdAt: null,
        shellConfig: { ...defaultEmailShellConfig },
      };
}

export async function listEmailTemplates(key?: TemplateKey, search = "") {
  const database = getDatabase();
  if (!database) return [];
  const rows = await database
    .select()
    .from(emailTemplates)
    .where(
      key
        ? and(eq(emailTemplates.templateKey, key), eq(emailTemplates.isArchived, false))
        : eq(emailTemplates.isArchived, false),
    )
    .orderBy(emailTemplates.templateKey, emailTemplates.language, emailTemplates.name);
  const term = search.trim().toLocaleLowerCase("id-ID");
  return term ? rows.filter((row) => `${row.name} ${row.language}`.toLocaleLowerCase("id-ID").includes(term)) : rows;
}

export async function listActiveEmailTemplateOptions(key: TemplateKey) {
  const catalog = await listEmailTemplates(key);
  return Promise.all(
    catalog.map(async (entry) => {
      const active = await getActiveTemplate(key, entry.language, entry.id);
      return {
        id: entry.id,
        name: entry.name,
        language: entry.language,
        isDefault: entry.isDefault,
        version: active.version,
        subject: active.subject,
        content: active.content,
      };
    }),
  );
}

export function fillEmailTemplate(content: EmailNode, variables: Record<string, string>): EmailNode {
  if (content.type === "emailVariable") {
    const token = String(content.attrs?.token ?? "");
    return { type: "text", text: variables[token] || "—" };
  }
  return {
    ...content,
    ...(content.type === "text"
      ? { text: (content.text ?? "").replace(/{{([^{}]+)}}/g, (_, token: string) => variables[token] || "—") }
      : {}),
    ...(content.content ? { content: content.content.map((child) => fillEmailTemplate(child, variables)) } : {}),
  };
}

export function fillEmailSubject(subject: string, variables: Record<string, string>) {
  return subject
    .replace(/{{([^{}]+)}}/g, (_, token: string) => variables[token] || "—")
    .replace(/[\r\n]/g, " ")
    .slice(0, 998);
}

function plainText(node: EmailNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "emailVariable") return `{{${String(node.attrs?.token ?? "")}}}`;
  if (node.type === "hardBreak") return "\n";
  if (node.type === "tableRow") return `${(node.content ?? []).map(plainText).join("\t")}\n`;
  if (node.type === "listItem") return `• ${(node.content ?? []).map(plainText).join("").trim()}\n`;
  const content = (node.content ?? []).map(plainText).join("");
  return ["paragraph", "heading", "blockquote"].includes(node.type) ? `${content}\n` : content;
}

export async function renderEmailDocument(content: EmailNode, variables: Record<string, string>) {
  const database = getDatabase();
  const attachments: EmailAttachment[] = [];
  const imageCache = new Map<string, string>();
  function expand(value: string) {
    return value.replace(/{{([^{}]+)}}/g, (_, token: string) => variables[token] || "—");
  }
  async function render(node: EmailNode): Promise<string> {
    const children = (await Promise.all((node.content ?? []).map(render))).join("");
    if (node.type === "text") {
      let value = escapeEmailText(expand(node.text ?? "")).replace(/\n/g, "<br>");
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") value = `<strong>${value}</strong>`;
        if (mark.type === "italic") value = `<em>${value}</em>`;
        if (mark.type === "underline") value = `<u>${value}</u>`;
        if (mark.type === "strike") value = `<s>${value}</s>`;
        if (mark.type === "link") {
          const href = String(mark.attrs?.href ?? "");
          if (/^(https:\/\/|mailto:)/i.test(href)) value = `<a href="${escapeEmailText(href)}">${value}</a>`;
        }
      }
      return value;
    }
    if (node.type === "emailVariable") {
      const token = String(node.attrs?.token ?? "");
      return escapeEmailText(variables[token] || "—");
    }
    if (node.type === "image") {
      const id =
        String(node.attrs?.src ?? "")
          .split("/")
          .pop() ?? "";
      if (!database || !/^[0-9a-f-]{36}$/.test(id)) return "";
      let cid = imageCache.get(id);
      if (!cid) {
        const [media] = await database.select().from(emailTemplateMedia).where(eq(emailTemplateMedia.id, id)).limit(1);
        if (!media) return "";
        cid = `template-${id}@anugrahplastik.com`;
        imageCache.set(id, cid);
        attachments.push({
          filename: `${id}.${media.mimeType === "image/png" ? "png" : "jpg"}`,
          content: await readFile(privateFilePath(media.storagePath)),
          cid,
        });
      }
      return `<img alt="${escapeEmailText(String(node.attrs?.alt ?? "Gambar email").slice(0, 160))}" src="cid:${cid}" style="max-width:100%;height:auto">`;
    }
    const tags: Record<string, string> = {
      doc: "div",
      paragraph: "p",
      heading: "h2",
      bulletList: "ul",
      orderedList: "ol",
      listItem: "li",
      blockquote: "blockquote",
      table: "table",
      tableRow: "tr",
      tableCell: "td",
      tableHeader: "th",
    };
    if (node.type === "hardBreak") return "<br>";
    if (node.type === "horizontalRule") return "<hr>";
    const tag = tags[node.type];
    if (!tag) return children;
    const style =
      tag === "table"
        ? ' style="width:100%;border-collapse:collapse"'
        : tag === "td" || tag === "th"
          ? ' style="border:1px solid #dce5ef;padding:8px;text-align:left"'
          : tag === "p"
            ? ' style="margin:0 0 16px"'
            : "";
    return `<${tag}${style}>${children}</${tag}>`;
  }
  const html = purifier.sanitize(await render(content), {
    ALLOWED_TAGS: [
      "div",
      "p",
      "h2",
      "strong",
      "em",
      "u",
      "s",
      "a",
      "br",
      "img",
      "ul",
      "ol",
      "li",
      "blockquote",
      "table",
      "tr",
      "td",
      "th",
      "hr",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "style"],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https:\/\/|mailto:|cid:)/i,
  });
  return { html, text: expand(plainText(content)).trim(), attachments };
}

async function brandedEmailShell({
  html,
  text,
  attachments,
  shellConfig = defaultEmailShellConfig,
}: {
  html: string;
  text: string;
  attachments: EmailAttachment[];
  shellConfig?: EmailShellConfig;
}) {
  const shell = parseEmailShellConfig(shellConfig);
  const accentByName = {
    blue: { line: "#1766c9", link: "#1766c9" },
    sky: { line: "#1582b8", link: "#126b99" },
    gold: { line: "#b7791f", link: "#965f11" },
  } as const;
  const accent = accentByName[shell.accent];
  const companyName = escapeEmailText(shell.companyName);
  const tagline = escapeEmailText(shell.tagline);
  const contactEmail = escapeEmailText(shell.contactEmail);
  const footerText = escapeEmailText(shell.footerText).replace(/\n/g, "<br>");
  let logo = "";
  let brandAttachment: EmailAttachment | null = null;
  try {
    const content = await readFile(resolve(process.cwd(), "public", shell.logoPath.slice(1)));
    logo = `<img src="cid:${brandLogoCid}" alt="Anugrah Plastik" width="52" height="52" style="display:block;width:52px;height:52px;border:0;outline:none;text-decoration:none">`;
    brandAttachment = { filename: "anugrah-plastik.png", content, cid: brandLogoCid };
  } catch {
    // Email stays legible when a local development checkout does not include the approved brand asset.
  }

  return {
    html: `<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#eef2f7;color:#1e2d3d;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;padding:0;background:#eef2f7"><tr><td align="center" style="padding:28px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dce5ef;border-radius:16px;overflow:hidden"><tr><td style="padding:24px 28px;background:#102b49;border-bottom:4px solid ${accent.line}"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>${logo ? `<td style="padding:0 14px 0 0;vertical-align:middle">${logo}</td>` : ""}<td style="vertical-align:middle"><strong style="display:block;color:#ffffff;font-size:19px;line-height:1.2;letter-spacing:.02em">${companyName}</strong><span style="display:block;margin-top:5px;color:#c9d9ea;font-size:11px;line-height:1.35;letter-spacing:.12em">${tagline}</span></td></tr></table></td></tr><tr><td style="padding:30px 28px;color:#26374b">${html}</td></tr><tr><td style="padding:18px 28px;background:#f7f9fc;border-top:1px solid #e1e8f0;color:#66778b;font-size:12px;line-height:1.6">${companyName} · <a href="mailto:${contactEmail}" style="color:${accent.link};text-decoration:none">${contactEmail}</a><br>${footerText}</td></tr></table></td></tr></table></body></html>`,
    text,
    attachments: brandAttachment ? [brandAttachment, ...attachments] : attachments,
  };
}

export async function buildBrandedEmailDocument(
  content: EmailNode,
  variables: Record<string, string>,
  shellConfig?: unknown,
) {
  return brandedEmailShell({
    ...(await renderEmailDocument(content, variables)),
    shellConfig: parseEmailShellConfig(shellConfig),
  });
}

export async function buildTemplatedEmail(
  content: EmailNode,
  variables: Record<string, string>,
  key: TemplateKey = "new",
  pinnedLayout?: EmailNode,
  pinnedShellConfig?: unknown,
) {
  const safeContent = validateEmailDoc(content, key);
  const body = await renderEmailDocument(safeContent, variables);
  const layout = pinnedLayout
    ? { content: pinnedLayout, shellConfig: parseEmailShellConfig(pinnedShellConfig) }
    : await getActiveTemplate("layout");
  const safeLayout = validateEmailDoc(layout.content, "layout");
  const frame = await renderEmailDocument(safeLayout, { ...variables, message: "__EMAIL_BODY__" });
  return brandedEmailShell({
    html: frame.html.replace(/<p[^>]*>__EMAIL_BODY__<\/p>/, body.html),
    text: frame.text.replace("__EMAIL_BODY__", body.text),
    attachments: [...frame.attachments, ...body.attachments],
    shellConfig: layout.shellConfig,
  });
}

export async function inlineArchivedTemplateImages(html: string) {
  const database = getDatabase();
  if (!database) return html;
  const ids = [
    ...new Set([...html.matchAll(/cid:template-([0-9a-f-]{36})@anugrahplastik\.com/gi)].map((match) => match[1])),
  ].slice(0, 5);
  let result = html;
  for (const id of ids) {
    const [media] = await database.select().from(emailTemplateMedia).where(eq(emailTemplateMedia.id, id)).limit(1);
    if (!media) continue;
    try {
      const image = await readFile(privateFilePath(media.storagePath));
      result = result.replaceAll(
        `cid:template-${id}@anugrahplastik.com`,
        `data:${media.mimeType};base64,${image.toString("base64")}`,
      );
    } catch {
      // The text version remains available if an archived image was removed outside the application.
    }
  }
  if (result.includes(`cid:${brandLogoCid}`)) {
    try {
      const image = await readFile(resolve(process.cwd(), "public", "brand", "quotation-logo.png"));
      result = result.replaceAll(`cid:${brandLogoCid}`, `data:image/png;base64,${image.toString("base64")}`);
    } catch {
      // The archived text email remains readable if the bundled brand asset is unavailable.
    }
  }
  return result;
}
