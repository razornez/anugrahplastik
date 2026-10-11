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

function editorialBlocks(content: LandingContent) {
  const capabilities = content.capabilities.filter((item) => item.title && item.description && item.proof);
  const process = content.processSteps.filter((item) => item.title && item.description);
  const gallery = content.galleryCategories.filter(
    (item) => item.isPublished && item.title && item.imagePath && item.altText && item.products.length,
  );
  const testimonials = content.testimonials.filter((item) => item.isPublished && item.name && item.role && item.quote);
  const insights = content.featuredInsights.filter(
    (item) => item.isPublished && item.slug && item.title && item.excerpt,
  );
  if (!capabilities.length && !process.length && !gallery.length && !testimonials.length && !insights.length) return "";
  const cards = gallery
    .map(
      (item) =>
        `<article class="ap-category-card"><img loading="lazy" src="${escapeHtml(item.imagePath)}" alt="${escapeHtml(item.altText)}"><div><h3>${escapeHtml(item.title)}</h3><p>Produk</p><ul>${item.products.map((product) => `<li>${escapeHtml(product)}</li>`).join("")}</ul><a href="/kategori/${escapeHtml(item.slug)}">${escapeHtml(item.ctaLabel)}</a></div></article>`,
    )
    .join("");
  return `<style>.ap-evidence{padding:96px 20px;background:#f8fafc;color:#12233b}.ap-evidence .ap-wrap{max-width:1180px;margin:auto}.ap-evidence header{margin:0 0 26px}.ap-evidence header span{color:#6751ca;font-size:11px;font-weight:800;letter-spacing:.12em}.ap-evidence h2{margin:8px 0 0;font-size:clamp(28px,4vw,46px);line-height:1.08}.ap-evidence-grid,.ap-category-grid,.ap-evidence-process,.ap-proof-quotes,.ap-insights{display:grid;gap:16px;margin:22px 0 54px}.ap-evidence-grid{grid-template-columns:repeat(3,1fr)}.ap-evidence-grid article,.ap-evidence-process article,.ap-proof-quotes figure,.ap-insights a{padding:22px;border:1px solid #dce4ef;border-radius:16px;background:#fff}.ap-evidence h3{margin:0 0 8px;font-size:18px}.ap-evidence p,.ap-evidence blockquote,.ap-evidence span{line-height:1.6}.ap-evidence small{color:#6751ca;font-weight:700}.ap-evidence-process{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}.ap-evidence-process b{color:#7c3bd1;font-size:26px}.ap-category-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ap-category-card{overflow:hidden;border:1px solid #d7deea;border-radius:14px;background:#fff}.ap-category-card img{display:block;width:100%;aspect-ratio:1.55;object-fit:cover}.ap-category-card>div{padding:17px}.ap-category-card p{margin:12px 0 5px;font-size:12px}.ap-category-card ul{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin:0 0 16px;padding-left:18px;font-size:13px;line-height:1.4}.ap-category-card a{display:grid;min-height:44px;place-items:center;border-radius:999px;background:#6f39ca;color:#fff;font-size:13px;font-weight:800;text-decoration:none}.ap-proof-quotes{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}.ap-proof-quotes figure{margin:0}.ap-proof-quotes blockquote{margin:0 0 12px}.ap-insights{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.ap-insights a{display:grid;gap:8px;color:inherit;text-decoration:none}.ap-insights strong{font-size:17px}@media(max-width:700px){.ap-evidence{padding:64px 16px}.ap-evidence-grid,.ap-category-grid{grid-template-columns:1fr}.ap-category-card ul{font-size:12px}}</style><section id="ap-evidence" class="ap-evidence"><div class="ap-wrap">${capabilities.length ? `<header><span>KEUNGGULAN TERUKUR</span><h2>Kapabilitas yang dapat diperiksa.</h2></header><div class="ap-evidence-grid">${capabilities.map((item) => `<article><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p><small>${escapeHtml(item.proof)}</small></article>`).join("")}</div>` : ""}${process.length ? `<div class="ap-evidence-process">${process.map((item, index) => `<article><b>0${index + 1}</b><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></article>`).join("")}</div>` : ""}${gallery.length ? `<header><span>KATEGORI PRODUK</span><h2>Contoh kategori yang dapat kami bantu.</h2></header><div class="ap-category-grid">${cards}</div>` : ""}${testimonials.length ? `<div class="ap-proof-quotes">${testimonials.map((item) => `<figure><blockquote>“${escapeHtml(item.quote)}”</blockquote><figcaption>${escapeHtml(item.name)} · ${escapeHtml(item.role)}</figcaption></figure>`).join("")}</div>` : ""}${insights.length ? `<div class="ap-insights">${insights.map((item) => `<a href="/insight/${escapeHtml(item.slug)}"><small>${escapeHtml(item.category)}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.excerpt)}</span></a>`).join("")}</div>` : ""}</div></section>`;
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
  markup = markup.replace(
    /(<span id="ap-copy">[\s\S]*?<\/span>)/,
    `$1 <a class="ap-link" href="/privasi" style="margin-left: 12px">Privasi &amp; pengaturan analitik</a>`,
  );

  markup = markup.replace(/<footer/, `${editorialBlocks(content)}<footer`);

  return markup;
}
