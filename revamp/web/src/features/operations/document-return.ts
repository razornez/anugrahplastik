const transactionDetailPattern = /^\/admin\/transactions\/[0-9a-f-]{36}$/i;

export function safeDocumentReturnTo(value: unknown) {
  if (typeof value !== "string" || value.length > 1200 || value.startsWith("//")) return null;
  try {
    const url = new URL(value, "https://admin.local");
    if (url.origin !== "https://admin.local" || !transactionDetailPattern.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function documentSettingsUrl(parameters: Record<string, string>, returnTo: string | null) {
  const query = new URLSearchParams(parameters);
  if (returnTo) query.set("returnTo", returnTo);
  return `/admin/settings/documents?${query.toString()}`;
}
