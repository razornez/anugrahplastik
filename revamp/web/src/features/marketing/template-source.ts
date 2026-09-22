import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LandingContent } from "@/features/content/landing-content";

const templatePath = join(process.cwd(), "src", "features", "marketing", "template-light.html");
const source = readFileSync(templatePath, "utf8");

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function replaceElementText(markup: string, sectionId: string, tagName: "h2" | "p", value: string) {
  const expression = new RegExp(`(<section[^>]+id="${sectionId}"[\\s\\S]*?<${tagName}[^>]*>)[\\s\\S]*?(</${tagName}>)`);
  return markup.replace(expression, `$1${escapeHtml(value)}$2`);
}

function replaceFirstElementText(markup: string, expression: RegExp, value: string) {
  return markup.replace(expression, `$1${escapeHtml(value)}$2`);
}

function extractTemplate() {
  const component = source.match(/<x-dc\b[^>]*>([\s\S]*?)<\/x-dc>/)?.[1];
  if (!component) throw new Error("Template landing tidak dapat dibaca.");

  const markup = component
    .replace(/<helmet>[\s\S]*?<\/helmet>/, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, "")
    .replace(/\sdata-dc-[\w-]+(?:=("[^"]*"|'[^']*'))?/g, "")
    .replace(/\sdata-props=("[^"]*"|'[^']*')/g, "");

  return markup;
}

export function renderLandingTemplate(content: LandingContent) {
  const initialMarkup = extractTemplate();
  const toWebp = (path: string) => `/images-webp/${path.replace(/\.jpe?g$/i, ".webp")}`;
  let markup = initialMarkup
    .replace(/src="img\/([^"]+)"/g, (_match, path: string) => `src="${toWebp(path)}"`)
    .replace(/data-src="img\/([^"]+)"/g, (_match, path: string) => `data-src="${toWebp(path)}"`);

  markup = markup
    .replace(/(<span id="ap-hero-title-before">)[\s\S]*?(<\/span>)/, `$1${escapeHtml(content.hero.titleBefore)}$2`)
    .replace(
      /(id="ap-hero-title-highlight"[\s\S]*?>)[\s\S]*?(<span\s+style=)/,
      `$1${escapeHtml(content.hero.titleHighlight)}$2`,
    )
    .replace(/(<span id="ap-hero-title-after">)[\s\S]*?(<\/span>)/, `$1${escapeHtml(content.hero.titleAfter)}$2`)
    .replace(
      /(<div id="ap-topbar"[\s\S]*?<span[^>]*>\s*<span[^>]*><\/span>)[\s\S]*?(<\/span>)/,
      `$1${escapeHtml(content.topbar.promise)}$2`,
    );

  markup = replaceFirstElementText(
    markup,
    /(<section id="ap-hero"[\s\S]*?<h1[\s\S]*?<\/h1>\s*<p[^>]*>)[\s\S]*?(<\/p>)/,
    content.hero.description,
  );
  markup = replaceFirstElementText(
    markup,
    /(<section id="ap-hero"[\s\S]*?<a class="ap-btn-wa"[^>]*>)[\s\S]*?(<\/a>)/,
    content.hero.primaryCta,
  );
  markup = replaceFirstElementText(
    markup,
    /(<section id="ap-hero"[\s\S]*?<a class="ap-btn-ghost"[^>]*>)[\s\S]*?(<\/a>)/,
    content.hero.secondaryCta,
  );
  markup = replaceElementText(markup, "ap-about", "h2", content.about.title);
  markup = replaceFirstElementText(
    markup,
    /(<section id="ap-about"[\s\S]*?<h2[\s\S]*?<\/h2>\s*<p[^>]*>)[\s\S]*?(<\/p>)/,
    content.about.body,
  );
  markup = replaceElementText(markup, "ap-why", "h2", content.why.title);
  markup = replaceElementText(markup, "ap-process", "h2", content.process.title);
  markup = replaceElementText(markup, "ap-material", "h2", content.material.title);
  markup = replaceFirstElementText(
    markup,
    /(<section id="ap-material"[\s\S]*?<a class="ap-btn-wa"[^>]*>)[\s\S]*?(<\/a>)/,
    content.material.primaryCta,
  );
  markup = replaceElementText(markup, "ap-portfolio", "h2", content.portfolio.title);
  markup = replaceElementText(markup, "ap-faq", "h2", content.faq.title);
  markup = replaceFirstElementText(
    markup,
    /(<section id="ap-faq"[\s\S]*?<h2[\s\S]*?<\/h2>\s*<p[^>]*>)[\s\S]*?(<\/p>)/,
    content.faq.description,
  );
  markup = replaceFirstElementText(
    markup,
    /(<section id="ap-faq"[\s\S]*?<a class="ap-btn-wa"[^>]*>)[\s\S]*?(<\/a>)/,
    content.faq.primaryCta,
  );
  markup = replaceElementText(markup, "ap-contact", "h2", content.contact.title);
  markup = replaceFirstElementText(
    markup,
    /(<section id="ap-contact"[\s\S]*?<h2[\s\S]*?<\/h2>\s*<p[^>]*>)[\s\S]*?(<\/p>)/,
    content.contact.description,
  );
  markup = replaceFirstElementText(
    markup,
    /(<form id="ap-form"[\s\S]*?<h3[^>]*>)[\s\S]*?(<\/h3>)/,
    content.contact.formTitle,
  );
  markup = replaceFirstElementText(
    markup,
    /(<form id="ap-form"[\s\S]*?<h3[\s\S]*?<\/h3>\s*<p[^>]*>)[\s\S]*?(<\/p>)/,
    content.contact.formDescription,
  );
  markup = replaceFirstElementText(
    markup,
    /(<form id="ap-form"[\s\S]*?<button[^>]*>)[\s\S]*?(<\/button>)/,
    content.contact.primaryCta,
  );
  markup = replaceFirstElementText(
    markup,
    /(<footer[\s\S]*?<p style="font-size: 14px; line-height: 1\.65; margin: 16px 0 0; max-width: 340px">)[\s\S]*?(<\/p>)/,
    content.footer.description,
  );

  return markup;
}
