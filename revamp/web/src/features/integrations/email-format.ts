import "server-only";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const emailWindow = new JSDOM("").window;
const purifier = createDOMPurify(emailWindow);

const EMAIL_TAGS = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "center",
  "code",
  "col",
  "colgroup",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  "style",
];

const EMAIL_ATTRIBUTES = [
  "align",
  "alt",
  "bgcolor",
  "border",
  "cellpadding",
  "cellspacing",
  "colspan",
  "height",
  "href",
  "rowspan",
  "size",
  "src",
  "style",
  "title",
  "valign",
  "width",
];

export function sanitizeIncomingEmailHtml(html: string) {
  return purifier.sanitize(html, {
    ALLOWED_TAGS: EMAIL_TAGS,
    ALLOWED_ATTR: EMAIL_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: [
      "base",
      "button",
      "embed",
      "form",
      "iframe",
      "input",
      "math",
      "object",
      "script",
      "select",
      "svg",
      "textarea",
    ],
    FORBID_ATTR: ["srcset", "target"],
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function bodyAsHtml(body: string) {
  return body
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph).replace(/\r?\n/g, "<br>")}</p>`)
    .join("");
}

export function buildCompanyEmail(body: string) {
  const html = `<!doctype html>
<html lang="id">
  <body style="margin:0;padding:24px;background:#f3f6fa;color:#26374b;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;border:1px solid #e1e8f0;border-radius:12px;background:#ffffff">
      <tr><td style="padding:22px 28px;border-bottom:3px solid #1766c9">
        <strong style="display:block;color:#102b49;font-size:18px;letter-spacing:.02em">ANUGRAH PLASTIK</strong>
        <span style="color:#74839a;font-size:12px;letter-spacing:.08em">CETAK PLASTIK · BANDUNG</span>
      </td></tr>
      <tr><td style="padding:28px">${bodyAsHtml(body)}</td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #e8edf3;color:#74839a;font-size:12px">
        Anugrah Plastik · <a href="mailto:cs@anugrahplastik.com" style="color:#1766c9">cs@anugrahplastik.com</a>
      </td></tr>
    </table>
  </body>
</html>`;

  return { text: body.trim(), html };
}
