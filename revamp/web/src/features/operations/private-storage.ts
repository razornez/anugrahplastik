import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export const sourceFileLimit = 100 * 1024 * 1024;
export const previewFileLimit = 25 * 1024 * 1024;
export const storageQuota = 5 * 1024 * 1024 * 1024;
export const storageBlockAt = Math.floor(storageQuota * 0.9);
export const storageWarningAt = Math.floor(storageQuota * 0.8);

const allowedFormats = ["step", "stp", "iges", "igs", "stl", "obj", "glb", "dwg", "dxf", "prt"] as const;
export type DesignFormat = (typeof allowedFormats)[number];

export function designFormat(filename: string): DesignFormat | null {
  const extension = basename(filename).split(".").pop()?.toLowerCase();
  return allowedFormats.includes(extension as DesignFormat) ? (extension as DesignFormat) : null;
}

export function isPreviewable(format: DesignFormat) {
  return format === "stl" || format === "obj" || format === "glb";
}

export function storageRoot() {
  const configured = process.env.PRIVATE_STORAGE_PATH;
  return configured
    ? isAbsolute(configured)
      ? configured
      : resolve(/* turbopackIgnore: true */ process.cwd(), configured)
    : join(process.cwd(), "storage", "private");
}

export function safeOriginalName(value: string) {
  const trimmed = basename(value)
    .replace(/[^a-zA-Z0-9._() -]/g, "_")
    .slice(0, 180);
  return trimmed || "desain-tanpa-nama";
}

export function storageName(format: DesignFormat) {
  const now = new Date();
  return join(
    "designs",
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${randomUUID()}.${format}`,
  );
}

export async function preparePrivateDestination(relativePath: string) {
  const root = storageRoot();
  const absolutePath = resolve(root, relativePath);
  const resolvedRoot = resolve(root);
  if (absolutePath === resolvedRoot || !absolutePath.startsWith(resolvedRoot)) {
    throw new Error("Lokasi file tidak valid.");
  }
  await mkdir(dirname(absolutePath), { recursive: true });
  return absolutePath;
}

export function createFileDigest() {
  return createHash("sha256");
}

export async function removePrivateFile(relativePath: string) {
  const root = storageRoot();
  const absolutePath = resolve(root, relativePath);
  await rm(absolutePath, { force: true });
}

export async function privateFileExists(relativePath: string) {
  try {
    await access(resolve(storageRoot(), relativePath));
    return true;
  } catch {
    return false;
  }
}

export function writePrivateFile(absolutePath: string) {
  return createWriteStream(absolutePath, { flags: "wx", mode: 0o600 });
}
