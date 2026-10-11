import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

const decoderAssets = {
  "draco_decoder.js": "application/javascript; charset=utf-8",
  "draco_wasm_wrapper.js": "application/javascript; charset=utf-8",
  "draco_decoder.wasm": "application/wasm",
} as const;

function operationsUser(role: string) {
  return role === "admin" || role === "sales";
}

export async function GET(_request: Request, context: { params: Promise<{ asset: string }> }) {
  const user = await getSession();
  if (!user || !operationsUser(user.role)) return new NextResponse("Akses ditolak.", { status: 403 });
  const { asset } = await context.params;
  if (!(asset in decoderAssets)) return new NextResponse("Decoder tidak ditemukan.", { status: 404 });
  try {
    const absolutePath = path.join(
      process.cwd(),
      "node_modules",
      "three",
      "examples",
      "jsm",
      "libs",
      "draco",
      "gltf",
      asset,
    );
    const body = await readFile(absolutePath);
    return new NextResponse(body, {
      headers: {
        "Content-Type": decoderAssets[asset as keyof typeof decoderAssets],
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Decoder belum tersedia.", { status: 503 });
  }
}
