import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export async function readInvoiceLogo(logoPath: string) {
  if (!/^\/[a-zA-Z0-9/_-]+\.(?:png|webp)$/.test(logoPath)) {
    throw new Error("Logo invoice harus berkas PNG atau WebP di folder public.");
  }
  const publicRoot = await realpath(resolve(process.cwd(), "public"));
  const file = await realpath(resolve(publicRoot, logoPath.slice(1)));
  const within = relative(publicRoot, file);
  if (!within || within.startsWith("..") || isAbsolute(within)) throw new Error("Path logo invoice tidak aman.");
  const bytes = await readFile(file);
  if (bytes.length > 200_000) throw new Error("Logo invoice terlalu besar (maksimal 200 KB).");
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !webp) throw new Error("Isi berkas logo tidak cocok dengan format PNG atau WebP.");
  return `data:${png ? "image/png" : "image/webp"};base64,${bytes.toString("base64")}`;
}
