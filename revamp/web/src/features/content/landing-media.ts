import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { contentBlocks, contentRevisions, mediaAssets } from "@/lib/database/schema";
import { preparePrivateDestination, privateFilePath } from "@/features/operations/private-storage";
import { LANDING_CONTENT_KEY } from "./landing-content";

export const LANDING_MEDIA_QUOTA = 500 * 1024 * 1024;
const inputLimit = 5 * 1024 * 1024;
const pixelLimit = 24_000_000;
const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export type LandingMedia = {
  id: string;
  url: string;
  previewUrl: string;
  altText: string;
  caption: string | null;
  byteSize: number;
  width: number;
  height: number;
  createdAt: Date;
};

function urlFor(id: string, preview = false) {
  return `/api/media/${id}${preview ? "?size=small" : ""}`;
}

function publicRecord(record: typeof mediaAssets.$inferSelect): LandingMedia | null {
  if (!record.storagePath || !record.previewPath || !record.byteSize || !record.width || !record.height) return null;
  return {
    id: record.id,
    url: urlFor(record.id),
    previewUrl: urlFor(record.id, true),
    altText: record.altText,
    caption: record.caption,
    byteSize: record.byteSize + (record.previewByteSize ?? 0),
    width: record.width,
    height: record.height,
    createdAt: record.createdAt,
  };
}

export async function listLandingMedia() {
  const database = getDatabase();
  if (!database) return { assets: [] as LandingMedia[], used: 0, quota: LANDING_MEDIA_QUOTA };
  const records = await database
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.scope, "landing"))
    .orderBy(asc(mediaAssets.createdAt));
  const assets = records.map(publicRecord).filter((asset): asset is LandingMedia => Boolean(asset));
  return { assets, used: assets.reduce((total, asset) => total + asset.byteSize, 0), quota: LANDING_MEDIA_QUOTA };
}

export async function uploadLandingMedia(file: File, altText: string, caption: string | null, actorId: string) {
  if (!acceptedMimeTypes.has(file.type) || file.size < 1 || file.size > inputLimit)
    throw new Error("Gunakan JPEG, PNG, atau WebP maksimal 5 MB.");
  const normalizedAlt = altText.trim();
  if (!normalizedAlt || normalizedAlt.length > 220)
    throw new Error("Alt text gambar wajib diisi dan maksimal 220 karakter.");

  const input = Buffer.from(await file.arrayBuffer());
  const source = sharp(input, { limitInputPixels: pixelLimit, animated: false, failOn: "error" });
  const info = await source.metadata();
  if (!info.width || !info.height || !info.format || !["jpeg", "png", "webp"].includes(info.format))
    throw new Error("Berkas gambar tidak valid.");
  if (info.width * info.height > pixelLimit) throw new Error("Ukuran piksel gambar terlalu besar.");

  const full = await sharp(input, { limitInputPixels: pixelLimit, animated: false })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 85, effort: 4 })
    .toBuffer();
  const small = await sharp(input, { limitInputPixels: pixelLimit, animated: false })
    .rotate()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78, alphaQuality: 82, effort: 4 })
    .toBuffer();
  const optimizedInfo = await sharp(full).metadata();
  if (!optimizedInfo.width || !optimizedInfo.height) throw new Error("Gambar hasil optimasi tidak valid.");

  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [{ used = "0" }] = await database
    .select({
      used: sql<string>`coalesce(sum(${mediaAssets.byteSize} + coalesce(${mediaAssets.previewByteSize}, 0)), 0)`,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.scope, "landing"));
  if (Number(used) + full.length + small.length > LANDING_MEDIA_QUOTA)
    throw new Error("Kuota media landing 500 MB sudah penuh. Hapus aset yang tidak dipakai terlebih dahulu.");

  const id = randomUUID();
  const storagePath = join("landing-media", `${id}.webp`);
  const previewPath = join("landing-media", `${id}.small.webp`);
  try {
    await writeFile(await preparePrivateDestination(storagePath), full, { flag: "wx", mode: 0o600 });
    await writeFile(await preparePrivateDestination(previewPath), small, { flag: "wx", mode: 0o600 });
    const [record] = await database
      .insert(mediaAssets)
      .values({
        id,
        path: urlFor(id),
        storagePath,
        previewPath,
        altText: normalizedAlt,
        caption: caption?.trim() || null,
        mimeType: "image/webp",
        byteSize: full.length,
        previewByteSize: small.length,
        sha256: createHash("sha256").update(full).digest("hex"),
        width: optimizedInfo.width,
        height: optimizedInfo.height,
        scope: "landing",
        uploadedBy: actorId,
        status: "draft",
      })
      .returning();
    return publicRecord(record)!;
  } catch (error) {
    await Promise.all([
      unlink(privateFilePath(storagePath)).catch(() => undefined),
      unlink(privateFilePath(previewPath)).catch(() => undefined),
    ]);
    throw error;
  }
}

function containsReference(value: unknown, assetId: string): boolean {
  if (typeof value === "string") return value.includes(`/api/media/${assetId}`);
  if (Array.isArray(value)) return value.some((item) => containsReference(item, assetId));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsReference(item, assetId));
  return false;
}

export async function landingMediaIsReferenced(assetId: string) {
  const database = getDatabase();
  if (!database) return false;
  const [block] = await database
    .select({
      content: contentBlocks.content,
      draft: contentBlocks.draftContent,
      published: contentBlocks.publishedContent,
    })
    .from(contentBlocks)
    .where(eq(contentBlocks.key, LANDING_CONTENT_KEY));
  if (block && [block.content, block.draft, block.published].some((content) => containsReference(content, assetId)))
    return true;
  const revisions = await database.select({ content: contentRevisions.content }).from(contentRevisions);
  return revisions.some((revision) => containsReference(revision.content, assetId));
}

export async function readLandingMedia(id: string, preview = false) {
  const database = getDatabase();
  if (!database) return null;
  const [record] = await database
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.scope, "landing")));
  const path = preview ? record?.previewPath : record?.storagePath;
  if (!record || !path) return null;
  return { record, bytes: await readFile(privateFilePath(path)) };
}

export async function removeLandingMedia(id: string) {
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  if (await landingMediaIsReferenced(id))
    throw new Error("Aset masih dipakai konten atau riwayat revisi dan tidak dapat dihapus.");
  const [record] = await database
    .delete(mediaAssets)
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.scope, "landing")))
    .returning();
  if (!record) throw new Error("Aset tidak ditemukan.");
  await Promise.all([
    record.storagePath && unlink(privateFilePath(record.storagePath)).catch(() => undefined),
    record.previewPath && unlink(privateFilePath(record.previewPath)).catch(() => undefined),
  ]);
}
