const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/manifest+json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
};

/**
 * Retire the former global application manifest. Keeping this tombstone at the
 * old URL makes browsers and edge caches discard the previously published
 * install metadata instead of continuing to expose it on the public website.
 */
export function GET() {
  return new Response(null, { status: 410, headers });
}
