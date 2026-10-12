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

/**
 * The public template is the visual contract.  These helpers only replace the
 * children of an existing template container or clone an existing card. They
 * never invent a new section/grid around editorial data.
 */
function closingTagIndex(markup: string, openIndex: number, tagName: string) {
  const expression = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  expression.lastIndex = openIndex;
  let depth = 0;
  for (let match = expression.exec(markup); match; match = expression.exec(markup)) {
    const isClose = match[0].startsWith("</");
    if (!isClose) depth += 1;
    else depth -= 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return -1;
}

function elementByClass(markup: string, className: string, tagName = "div") {
  const expression = new RegExp(`<${tagName}\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, "i");
  const match = expression.exec(markup);
  if (!match || match.index === undefined) return null;
  const end = closingTagIndex(markup, match.index, tagName);
  if (end < 0) return null;
  return { start: match.index, end, html: markup.slice(match.index, end) };
}

function replaceContainerChildren(markup: string, className: string, children: string) {
  const container = elementByClass(markup, className);
  if (!container) return markup;
  const openingEnd = container.html.indexOf(">") + 1;
  const opening = container.html.slice(0, openingEnd);
  const closing = container.html.slice(container.html.lastIndexOf("</"));
  return `${markup.slice(0, container.start)}${opening}${children}${closing}${markup.slice(container.end)}`;
}

function sectionById(markup: string, id: string) {
  const expression = new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>`, "i");
  const match = expression.exec(markup);
  if (!match || match.index === undefined) return null;
  const end = closingTagIndex(markup, match.index, "section");
  return end < 0 ? null : { start: match.index, end, html: markup.slice(match.index, end) };
}

function replaceEditorialValuesInSection(markup: string, id: string, transform: (section: string) => string) {
  const section = sectionById(markup, id);
  return section ? `${markup.slice(0, section.start)}${transform(section.html)}${markup.slice(section.end)}` : markup;
}

function renderApprovedEditorialSlots(markup: string, content: LandingContent) {
  markup = replaceEditorialValuesInSection(markup, "ap-about", (section) => {
    let statIndex = 0;
    return section.replace(
      /(<div class="ap-about__stat"[\s\S]*?<div[^>]*>)[\s\S]*?(<\/div>\s*<div[^>]*>)[\s\S]*?(<\/div>\s*<\/div>)/g,
      (full, valueStart, labelStart, end) => {
        const stat = content.about.stats[statIndex++];
        return stat ? `${valueStart}${escapeHtml(stat.value)}${labelStart}${escapeHtml(stat.label)}${end}` : full;
      },
    );
  });

  markup = replaceEditorialValuesInSection(markup, "ap-why", (section) => {
    const titles = content.capabilities.map((item) => item.title);
    const descriptions = content.capabilities.map((item) => item.description);
    let titleIndex = 0;
    let shortIndex = 0;
    let descriptionIndex = 0;
    return section
      .replace(/(<span class="ap-why-title-full"[^>]*>)[\s\S]*?(<\/span>)/g, (full, before, after) => {
        const value = titles[titleIndex++];
        return value === undefined ? full : `${before}${escapeHtml(value)}${after}`;
      })
      .replace(/(<span class="ap-why-title-short"[^>]*>)[\s\S]*?(<\/span>)/g, (full, before, after) => {
        const value = titles[shortIndex++];
        return value === undefined ? full : `${before}${escapeHtml(value)}${after}`;
      })
      .replace(/(<\/h3>\s*<p[^>]*>)[\s\S]*?(<\/p>)/g, (full, before, after) => {
        const value = descriptions[descriptionIndex++];
        return value === undefined ? full : `${before}${escapeHtml(value)}${after}`;
      });
  });

  markup = replaceEditorialValuesInSection(markup, "ap-process", (section) => {
    let index = 0;
    return section.replace(
      /(<h3[^>]*>)[\s\S]*?(<\/h3>\s*<p[^>]*>)[\s\S]*?(<\/p>)/g,
      (full, headingStart, descriptionStart, end) => {
        const step = content.processSteps[index++];
        return step
          ? `${headingStart}${escapeHtml(step.title)}${descriptionStart}${escapeHtml(step.description)}${end}`
          : full;
      },
    );
  });

  markup = replaceEditorialValuesInSection(markup, "ap-faq", (section) => {
    let index = 0;
    return section.replace(
      /(<button class="ap-faq-q"[\s\S]*?<span>)[\s\S]*?(<\/span><\/span\s*>\s*<span[\s\S]*?<\/button>\s*<div class="ap-faq-a"[\s\S]*?<p[^>]*>)[\s\S]*?(<\/p>)/g,
      (full, questionStart, answerStart, end) => {
        const item = content.faq.items[index++];
        return item
          ? `${questionStart}${escapeHtml(item.question)}${answerStart}${escapeHtml(item.answer)}${end}`
          : full;
      },
    );
  });

  markup = replaceEditorialValuesInSection(markup, "ap-portfolio", (section) => {
    const base = elementByClass(section, "ap-filter", "button");
    if (!base) return section;
    const filters = content.portfolio.filters.map((filter) =>
      base.html
        .replace(/(data-filter=")[^"]*(")/i, `$1${escapeHtml(filter.id)}$2`)
        .replace(/(>)[^<]*(<\/button>)/i, `$1${escapeHtml(filter.label)}$2`),
    );
    return replaceContainerChildren(section, "ap-portfolio-filters", filters.join(""));
  });

  return markup;
}

function withoutClassElement(markup: string, className: string, tagName = "span") {
  const element = elementByClass(markup, className, tagName);
  return element ? `${markup.slice(0, element.start)}${markup.slice(element.end)}` : markup;
}

const hotBadge = `<span class="ap-pcard__hot" aria-label="Produk unggulan"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c4 0 7-2.6 7-6.3 0-2.6-1.7-4.7-4.2-6.8.1 1.8-.5 3.1-1.8 4.1.2-4-1.7-7.2-4.6-9.1.3 4.2-3.4 6.5-3.4 10.6C5 18.6 8 22 12 22Z" /><path d="M9.5 19.3c0-1.7 1.1-2.7 2.6-3.8.1 1.1.5 1.8 1.4 2.4.8.6 1.1 1.3 1.1 2.1" /></svg><span>Unggulan</span></span>`;

function renderMaterialCards(markup: string, content: LandingContent) {
  const base = elementByClass(markup, "ap-mat");
  if (!base) return markup;
  const cards = content.material.items.map((item) =>
    base.html
      .replace(/(<img class="ap-mat-image"[^>]*\bsrc=")[^"]*(")/i, `$1${escapeHtml(item.imagePath)}$2`)
      .replace(/(<img class="ap-mat-image"[^>]*\balt=")[^"]*(")/i, `$1${escapeHtml(item.altText)}$2`)
      .replace(/(<div class="ap-mat-code"[\s\S]*?>)[\s\S]*?(<\/div>)/i, `$1${escapeHtml(item.code)}$2`)
      .replace(/(<div class="ap-mat-sub"[\s\S]*?>)[\s\S]*?(<\/div>)/i, `$1${escapeHtml(item.name)}$2`)
      .replace(/(<p class="ap-mat-desc">)[\s\S]*?(<\/p>)/i, `$1${escapeHtml(item.description)}$2`),
  );
  return replaceContainerChildren(markup, "ap-material-grid", cards.join(""));
}

function renderPortfolioCards(markup: string, content: LandingContent) {
  const base = elementByClass(markup, "ap-pcard", "figure");
  if (!base) return markup;
  const categoryLabel = new Map(content.portfolio.filters.map((item) => [item.id, item.label]));
  const cards = content.portfolio.items
    .filter((item) => item.isPublished)
    .map((item) => {
      let card = withoutClassElement(base.html, "ap-pcard__hot");
      card = card
        .replace(/(data-cat=")[^"]*(")/i, `$1${escapeHtml(item.category)}$2`)
        .replace(/(data-src=")[^"]*(")/i, `$1${escapeHtml(item.imagePath)}$2`)
        .replace(/(data-caption=")[^"]*(")/i, `$1${escapeHtml(item.caption)}$2`)
        .replace(/(<img[^>]*\bsrc=")[^"]*(")/i, `$1${escapeHtml(item.imagePath)}$2`)
        .replace(/(<img[^>]*\balt=")[^"]*(")/i, `$1${escapeHtml(item.altText)}$2`)
        .replace(/(<figcaption[^>]*>)\s*[\s\S]*?(\s*<span[^>]*>)/i, `$1${escapeHtml(item.title)}$2`)
        .replace(
          /(<figcaption[\s\S]*?<span[^>]*>)[\s\S]*?(<\/span>\s*<\/figcaption>)/i,
          `$1${escapeHtml(categoryLabel.get(item.category) ?? item.category)}$2`,
        );
      return item.isHot ? card.replace(/(<figure[^>]*>)/i, `$1${hotBadge}`) : card;
    });
  return replaceContainerChildren(markup, "ap-gallery", cards.join(""));
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
  // Keunggulan dan proses sudah memakai struktur landing asli di atas. Jangan merender ulang di bawah footer.
  const capabilities: typeof content.capabilities = [];
  const process: typeof content.processSteps = [];
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
    /(<section id="ap-hero"[\s\S]*?<a class="ap-btn-primary"[^>]*>)[\s\S]*?(<\/a>)/,
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
  markup = markup
    .replace(
      /(<section id="ap-about"[\s\S]*?<img[^>]*\bsrc=")[^"]*(")/,
      `$1${escapeHtml(content.about.image.imagePath)}$2`,
    )
    .replace(
      /(<section id="ap-about"[\s\S]*?<img[^>]*\balt=")[^"]*(")/,
      `$1${escapeHtml(content.about.image.altText)}$2`,
    )
    .replace(/(<div id="ap-about-badge-text"[^>]*>)[\s\S]*?(<\/div>)/, `$1${escapeHtml(content.about.imageBadge)}$2`);
  markup = replaceElementText(markup, "ap-why", "h2", content.why.title);
  markup = replaceElementText(markup, "ap-process", "h2", content.process.title);
  markup = replaceElementText(markup, "ap-material", "h2", content.material.title);
  markup = replaceFirstElementText(
    markup,
    /(<section id="ap-material"[\s\S]*?<a class="ap-btn-wa"[^>]*>)[\s\S]*?(<\/a>)/,
    content.material.primaryCta,
  );
  markup = replaceElementText(markup, "ap-portfolio", "h2", content.portfolio.title);
  markup = replaceElementText(markup, "ap-trust", "h2", content.trust.title);
  markup = replaceFirstElementText(
    markup,
    /(<section id="ap-trust"[\s\S]*?<h2[\s\S]*?<\/h2>\s*<p[^>]*>)[\s\S]*?(<\/p>)/,
    content.trust.description,
  );
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

  // Repeating cards retain the approved source markup. Only their safe editorial
  // values are substituted here.
  markup = renderMaterialCards(markup, content);
  markup = renderPortfolioCards(markup, content);
  markup = renderApprovedEditorialSlots(markup, content);

  markup = markup.replace(/<footer/, `${editorialBlocks(content)}<footer`);

  return markup;
}
