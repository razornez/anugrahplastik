import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { privateDownloadTokens, transactionDocuments } from "@/lib/database/schema";
import { privateFilePath } from "@/features/operations/private-storage";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function issuePrivateDocumentLink(documentId: string, actorId: string) {
  const database = getDatabase();
  if (!database) throw new Error("Database belum tersedia.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
  const [record] = await database
    .insert(privateDownloadTokens)
    .values({ tokenHash: hashToken(token), documentId, expiresAt, createdBy: actorId })
    .returning({ id: privateDownloadTokens.id });
  const origin = (
    process.env.APP_ORIGIN ||
    (process.env.NODE_ENV === "production" ? "https://anugrahplastik.com" : "http://127.0.0.1:3100")
  ).replace(/\/$/, "");
  return { id: record.id, url: `${origin}/api/files/private/${token}`, expiresAt };
}

export async function resolvePrivateDocumentLink(token: string) {
  const database = getDatabase();
  if (!database || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const [record] = await database
    .select({ link: privateDownloadTokens, document: transactionDocuments })
    .from(privateDownloadTokens)
    .innerJoin(transactionDocuments, eq(transactionDocuments.id, privateDownloadTokens.documentId))
    .where(
      and(
        eq(privateDownloadTokens.tokenHash, hashToken(token)),
        gt(privateDownloadTokens.expiresAt, new Date()),
        isNull(privateDownloadTokens.revokedAt),
      ),
    )
    .limit(1);
  if (!record?.document.storagePath) return null;
  await database
    .update(privateDownloadTokens)
    .set({ downloadCount: sql`${privateDownloadTokens.downloadCount} + 1`, lastDownloadedAt: new Date() })
    .where(eq(privateDownloadTokens.id, record.link.id));
  return {
    path: privateFilePath(record.document.storagePath),
    filename: (record.document.originalName || "dokumen.pdf").replace(/[\r\n"\\\x00-\x1f]/g, "_").slice(0, 180),
  };
}

export async function revokePrivateDocumentLinks(documentId: string) {
  const database = getDatabase();
  if (!database) return;
  await database
    .update(privateDownloadTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(privateDownloadTokens.documentId, documentId), isNull(privateDownloadTokens.revokedAt)));
}
