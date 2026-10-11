import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { JSDOM } from "jsdom";
import type { PageObservation } from "./seo-benchmark";

const maxBytes = 1_000_000;

export function publicIpv4(address: string) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 88 || b === 168)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export function allowedUrl(raw: string, domain: string) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.port || url.username || url.password || isIP(host)) return null;
  if (host !== domain && host !== `www.${domain}`) return null;
  url.hash = "";
  return url;
}

async function readPublicUrl(
  raw: string,
  domain: string,
  redirects = 0,
): Promise<{ url: string; body: string; type: string }> {
  const url = allowedUrl(raw, domain);
  if (!url || redirects > 2) throw new Error("URL di luar domain audit.");
  const result = await new Promise<{ status: number; location?: string; body: string; type: string }>(
    async (resolve, reject) => {
      try {
        const addresses = await lookup(url.hostname, { all: true, family: 4 });
        const address = addresses.find((item) => publicIpv4(item.address));
        if (!address) throw new Error("Alamat situs tidak publik.");
        const req = request(
          url,
          {
            method: "GET",
            timeout: 8000,
            headers: {
              "user-agent": "AnugrahPlastikSeoAudit/1.0",
              accept: "text/html,application/xml,text/xml,text/plain",
            },
            lookup: (_hostname, _options, callback) => callback(null, address.address, 4),
          },
          (response) => {
            const chunks: Buffer[] = [];
            let size = 0;
            response.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > maxBytes) {
                req.destroy(new Error("Halaman terlalu besar."));
                return;
              }
              chunks.push(chunk);
            });
            response.on("end", () =>
              resolve({
                status: response.statusCode ?? 0,
                location: response.headers.location,
                body: Buffer.concat(chunks).toString("utf8"),
                type: String(response.headers["content-type"] ?? ""),
              }),
            );
          },
        );
        req.on("timeout", () => req.destroy(new Error("Situs tidak merespons.")));
        req.on("error", reject);
        req.end();
      } catch (error) {
        reject(error);
      }
    },
  );
  if (result.status >= 300 && result.status < 400 && result.location)
    return readPublicUrl(new URL(result.location, url).toString(), domain, redirects + 1);
  if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
  return { url: url.toString(), body: result.body, type: result.type };
}

export function robotsAllows(body: string, path: string) {
  let applies = false;
  let hasRules = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (key?.toLowerCase() === "user-agent") {
      if (hasRules) applies = false;
      applies ||= value === "*" || value.toLowerCase() === "anugrahplastikseoaudit";
      hasRules = false;
    } else if (applies && key?.toLowerCase() === "disallow") {
      hasRules = true;
      if (value && path.startsWith(value)) return false;
    } else if (applies && key?.toLowerCase() === "allow") {
      hasRules = true;
    }
  }
  return true;
}

function pageSignals(html: string, url: string, category: "jasa" | "spacer") {
  const document = new JSDOM(html).window.document;
  const title = document.title.trim().slice(0, 180) || null;
  const heading = document.querySelector("h1")?.textContent?.trim().slice(0, 180) || null;
  const description =
    document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim().slice(0, 240) || null;
  const text = document.body?.textContent?.replace(/\s+/g, " ").trim().slice(0, 5000).toLowerCase() ?? "";
  const vocabulary = category === "jasa" ? /cetak plastik|injection|injeksi|molding|moulding/i : /spacer|conduit/i;
  const signals: string[] = [];
  if (title && vocabulary.test(title)) signals.push("Judul halaman menyebut layanan atau produk terkait.");
  if (heading && vocabulary.test(heading)) signals.push("Judul utama halaman menyebut layanan atau produk terkait.");
  if (description && vocabulary.test(description)) signals.push("Ringkasan pencarian menjelaskan topik terkait.");
  if (vocabulary.test(text)) signals.push("Isi halaman membahas topik yang dipantau.");
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  try {
    if (canonical && new URL(canonical, url).hostname === new URL(url).hostname)
      signals.push("Halaman memiliki canonical ke domain yang sama.");
  } catch {
    // A malformed canonical is not evidence about the rest of the page.
  }
  if (document.querySelector('meta[name="robots"][content*="noindex"]')) signals.push("Halaman bertanda noindex.");
  return { title, heading, description, signals };
}

export async function inspectSeoPage(
  domain: string,
  category: "jasa" | "spacer",
  rankedUrl: string | null,
): Promise<PageObservation> {
  const unavailable = (): PageObservation => ({
    domain,
    category,
    url: null,
    status: "unavailable",
    title: null,
    heading: null,
    description: null,
    signals: [],
  });
  try {
    const root = `https://${domain}/`;
    const robots = await readPublicUrl(`${root}robots.txt`, domain).catch((error: unknown) => {
      if (error instanceof Error && error.message === "HTTP 404")
        return { body: "", url: `${root}robots.txt`, type: "text/plain" };
      return null;
    });
    if (!robots) return unavailable();
    const candidates = [rankedUrl].filter((item): item is string => Boolean(item));
    const sitemap = await readPublicUrl(`${root}sitemap.xml`, domain).catch(() => null);
    if (sitemap?.type.includes("xml")) {
      const urls = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((match) => match[1].replaceAll("&amp;", "&"))
        .filter((url) => allowedUrl(url, domain))
        .sort((a, b) => {
          const match = category === "spacer" ? /spacer|conduit/i : /plastik|injection|mold|cetak/i;
          return Number(match.test(b)) - Number(match.test(a));
        })
        .slice(0, 10);
      candidates.push(...urls);
    }
    candidates.push(root);
    for (const candidate of [...new Set(candidates)].slice(0, 12)) {
      const url = allowedUrl(candidate, domain);
      if (!url || (robots && !robotsAllows(robots.body, url.pathname))) continue;
      const page = await readPublicUrl(url.toString(), domain).catch(() => null);
      if (!page?.type.includes("html")) continue;
      const detail = pageSignals(page.body, page.url, category);
      if (rankedUrl || detail.signals.length >= 2 || candidate === root)
        return { domain, category, url: page.url, status: "checked", ...detail };
    }
  } catch {
    // A failed crawl is unknown evidence, never a negative SEO score.
  }
  return unavailable();
}
