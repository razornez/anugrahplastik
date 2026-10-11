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
  const previewStyles = `
    html { width: 100%; overflow-x: hidden; }
    body {
      width: 100%; min-width: 0; margin: 0; padding: 10px;
      overflow-x: hidden; overflow-wrap: anywhere;
      font: 13px/1.45 Arial, Helvetica, sans-serif; color: #293c52;
    }
    body * { box-sizing: border-box; max-width: 100% !important; min-width: 0 !important; }
    body :is(table, tbody, thead, tfoot, tr, td, th) { width: auto !important; }
    body table { width: 100% !important; border-collapse: collapse; }
    body :is(td, th) { overflow-wrap: anywhere; }
    body :is(img, svg, video) { width: auto !important; height: auto !important; }
    body :is(h1, h2, h3, h4, h5, h6) {
      margin: 0.7em 0 0.4em !important; line-height: 1.22 !important;
      overflow-wrap: anywhere; color: inherit;
    }
    body h1 { font-size: 19px !important; }
    body h2 { font-size: 17px !important; }
    body h3 { font-size: 16px !important; }
    body :is(p, div, span, a, li, td, th, blockquote, strong, b) {
      font-size: 13px !important; line-height: 1.45 !important;
    }
    body :is(small, sup, sub) { font-size: 11px !important; }
    body pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  `;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>${previewStyles}</style></head><body>${html}</body></html>`;
}
