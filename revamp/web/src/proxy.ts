import { NextResponse, type NextRequest } from "next/server";

/**
 * This is an extra crawler safeguard, not the authorization boundary.
 * Authorization remains in each server page, action, and private route.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/admin") || request.nextUrl.pathname.startsWith("/api/admin")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
