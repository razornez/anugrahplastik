import { getSession } from "@/lib/auth/session";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/manifest+json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
};

export async function GET() {
  const session = await getSession();
  if (!session) return new Response(null, { status: 404, headers: privateHeaders });

  return new Response(
    JSON.stringify({
      id: "/admin",
      name: "Anugrah Plastik Back Office",
      short_name: "Anugrah Plastik",
      description: "Ruang kerja internal Anugrah Plastik.",
      start_url: "/admin",
      scope: "/admin/",
      display: "standalone",
      background_color: "#f5f7fb",
      theme_color: "#0b2442",
      icons: [
        { src: "/brand/anugrah-plastik-icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/brand/anugrah-plastik-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    }),
    { headers: privateHeaders },
  );
}
