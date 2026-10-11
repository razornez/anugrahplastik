function parseOrigin(value: string | null): URL | null {
  if (!value || value === "null" || /[\\\s]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      /[?#]/.test(value)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

function isLoopback(hostname: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

/** Validate browser origin without trusting forwarded headers or Next.js loopback normalization. */
export function isRequestOriginAllowed(
  request: Pick<Request, "url" | "headers">,
  options: { environment: string | undefined; appOrigin?: string },
): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = parseOrigin(request.headers.get("origin"));
  if (!origin) return false;
  const configuredOrigin = options.appOrigin?.trim();
  if (configuredOrigin) {
    const expected = parseOrigin(configuredOrigin);
    return Boolean(expected && expected.origin === origin.origin);
  }
  let server: URL;
  try {
    server = new URL(request.url);
  } catch {
    return false;
  }
  if (origin.origin === server.origin) return true;
  return (
    options.environment === "development" &&
    isLoopback(origin.hostname) &&
    isLoopback(server.hostname) &&
    origin.host === request.headers.get("host") &&
    origin.protocol === server.protocol &&
    origin.port === server.port
  );
}
