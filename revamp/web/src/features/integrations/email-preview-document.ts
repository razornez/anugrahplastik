export function emailPreviewDocument(html: string, allowRemoteImages: boolean) {
  const imageSources = allowRemoteImages ? "data: https: cid:" : "data: cid:";
  const policy = [
    "default-src 'none'",
    `img-src ${imageSources}`,
    "style-src 'unsafe-inline'",
    "font-src data:",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "connect-src 'none'",
  ].join("; ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"></head><body style="margin:0;padding:16px;overflow-wrap:anywhere;font:15px/1.65 Arial,Helvetica,sans-serif;color:#293c52">${html}</body></html>`;
}
