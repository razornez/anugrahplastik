import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

const occtAssets = {
  "occt-import-js.js": "application/javascript; charset=utf-8",
  "occt-import-js-worker.js": "application/javascript; charset=utf-8",
  "occt-import-js.wasm": "application/wasm",
} as const;

function operationsUser(role: string) {
  return role === "admin" || role === "sales";
}

export async function GET(_request: Request, context: { params: Promise<{ asset: string }> }) {
  const user = await getSession();
  if (!user || !operationsUser(user.role)) return new NextResponse("Akses ditolak.", { status: 403 });
  const { asset } = await context.params;
  if (!(asset in occtAssets)) return new NextResponse("Pembaca CAD tidak ditemukan.", { status: 404 });
  try {
    const absolutePath = path.join(process.cwd(), "node_modules", "occt-import-js", "dist", asset);
    const body = await readFile(absolutePath);
    return new NextResponse(body, {
      headers: {
        "Content-Type": occtAssets[asset as keyof typeof occtAssets],
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Pembaca CAD belum tersedia.", { status: 503 });
  }
}
