export const DOCGEN_TEST_RECIPIENT = "razornez@gmail.com";

export type DocGenTemplateKind = "QUOTATION" | "INVOICE" | "DELIVERY" | "BAST";
const templateKinds: DocGenTemplateKind[] = ["QUOTATION", "INVOICE", "DELIVERY", "BAST"];

// Explicit opt-in for a separate local QA process, never a production fallback.
export function localQaRendererEnabled() {
  if (process.env.DOCGEN_RENDER_MODE !== "local_qa") return false;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.NODE_ENV !== "development" || !["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname))
    throw new Error("Renderer QA hanya tersedia pada proses development dengan database lokal.");
  return true;
}

export function docGenProviderReady(kind: DocGenTemplateKind) {
  if (localQaRendererEnabled()) return true;
  return Boolean(process.env.DOCGEN_API_KEY && docGenTemplateId(kind));
}

export function docGenTemplateReady(kind: DocGenTemplateKind) {
  if (localQaRendererEnabled()) return true;
  return docGenProviderReady(kind) && process.env[`DOCGEN_${kind}_TEMPLATE_READY`] === "yes";
}

function officialTemplatesReady() {
  if (process.env.DOCGEN_OFFICIAL_RELEASE_APPROVED !== "yes") return false;
  if (process.env.DOCGEN_OFFICIAL_INVOICE_APPROVED !== "yes") return false;
  const ids = templateKinds.map((kind) => {
    const official = process.env[`DOCGEN_OFFICIAL_TEMPLATE_${kind}_ID`];
    const example = process.env[`DOCGEN_TEMPLATE_${kind}_ID`];
    return official && official !== example ? official : null;
  });
  return ids.every(Boolean) && new Set(ids).size === templateKinds.length;
}

// An explicit approval is required before any DocGen template can be used for real customers.
export function docGenDummyMode() {
  if (localQaRendererEnabled()) return true;
  return process.env.DOCGEN_TEMPLATE_MODE !== "approved" || !officialTemplatesReady();
}

export function docGenTemplateId(kind: DocGenTemplateKind): string | undefined {
  if (!templateKinds.includes(kind)) return undefined;
  if (localQaRendererEnabled()) return `local_qa:${kind}`;
  if (process.env.DOCGEN_TEMPLATE_MODE === "approved" && !officialTemplatesReady()) {
    return undefined;
  }
  return docGenDummyMode()
    ? process.env[`DOCGEN_TEMPLATE_${kind}_ID`]
    : process.env[`DOCGEN_OFFICIAL_TEMPLATE_${kind}_ID`];
}

export function assertDocGenTransactionAllowed(dataClass: string) {
  if (docGenDummyMode() && dataClass !== "test") {
    throw new Error("Template DocGen masih berupa contoh dan hanya boleh dipakai pada transaksi uji.");
  }
}

export function assertDocGenEmailAllowed(dataClass: string, recipient: string, documentIsDummy: boolean) {
  if (localQaRendererEnabled()) throw new Error("Dokumen QA lokal tidak boleh dikirim melalui email.");
  if (!docGenDummyMode() && !documentIsDummy) return;
  if (dataClass !== "test" || recipient.toLowerCase() !== DOCGEN_TEST_RECIPIENT) {
    throw new Error("Dokumen contoh hanya boleh dikirim dari transaksi uji ke email uji yang ditetapkan.");
  }
}

export function docGenPayload<T extends object>(payload: T) {
  if (localQaRendererEnabled()) return { ...payload, isDummy: true, renderSource: "local_qa" };
  return { ...payload, isDummy: docGenDummyMode() };
}
