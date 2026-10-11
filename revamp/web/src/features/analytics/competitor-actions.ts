"use server";

import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, growthCompetitorSettings, growthSearchAudits } from "@/lib/database/schema";
import { preparePrivateDestination, removePrivateFile } from "@/features/operations/private-storage";
import {
  defaultCompetitors,
  normalizeDomain,
  ownDomain,
  searchKeywords,
  type Competitor,
  type SearchAuditResult,
} from "./competitor-model";

async function admin() {
  const user = await getSession();
  if (!user || user.role !== "admin") throw new Error("Hanya administrator yang boleh mengubah pembanding pesaing.");
  return user;
}

export async function saveGrowthCompetitors(_previous: string | null, formData: FormData): Promise<string | null> {
  const user = await admin();
  const database = getDatabase();
  if (!database) return "Database belum terhubung.";
  let competitors: Competitor[];
  try {
    competitors = defaultCompetitors.map((_, index) => {
      const name = String(formData.get(`name-${index}`) ?? "").trim();
      if (!name || name.length > 80) throw new Error("Nama pesaing harus diisi, maksimal 80 karakter.");
      return { name, domain: normalizeDomain(String(formData.get(`domain-${index}`) ?? "")) };
    });
    if (new Set(competitors.map((item) => item.domain)).size !== competitors.length)
      throw new Error("Domain pesaing harus berbeda.");
  } catch (error) {
    return error instanceof Error ? error.message : "Daftar pesaing tidak valid.";
  }
  await database.transaction(async (tx) => {
    await tx
      .insert(growthCompetitorSettings)
      .values({ id: 1, competitors, updatedBy: user.id })
      .onConflictDoUpdate({
        target: growthCompetitorSettings.id,
        set: { competitors, updatedBy: user.id, updatedAt: new Date() },
      });
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "growth.competitors_changed",
      entityType: "growth",
      entityId: "competitors",
      metadata: { competitors },
    });
  });
  revalidatePath("/admin/growth");
  revalidatePath("/admin/growth/competitors");
  return "Daftar pesaing disimpan. Audit lama tetap memakai daftar pada saat diperiksa.";
}

export async function saveGrowthSearchAudit(_previous: string | null, formData: FormData): Promise<string | null> {
  const user = await admin();
  const database = getDatabase();
  if (!database) return "Database belum terhubung.";
  const [settings] = await database
    .select({ competitors: growthCompetitorSettings.competitors })
    .from(growthCompetitorSettings)
    .limit(1);
  const competitors = (settings?.competitors as Competitor[] | undefined) ?? [...defaultCompetitors];
  const domains = [ownDomain, ...competitors.map((item) => item.domain)];
  if (String(formData.get("domains") ?? "") !== domains.join(","))
    return "Daftar pesaing berubah. Muat ulang halaman sebelum mencatat pemeriksaan.";
  const results: SearchAuditResult[] = [];
  for (const [index, keyword] of searchKeywords.entries()) {
    const positions: Record<string, number | null> = {};
    for (const [domainIndex, domain] of domains.entries()) {
      const raw = String(formData.get(`position-${index}-${domainIndex}`) ?? "").trim();
      if (raw && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 10))
        return `Posisi untuk “${keyword}” harus 1–10 atau kosong.`;
      positions[domain] = raw ? Number(raw) : null;
    }
    const sourceUrl = `https://www.google.com/search?hl=id&gl=id&q=${encodeURIComponent(keyword)}`;
    results.push({ keyword, positions, sourceUrl });
  }
  const evidence = formData.get("evidence");
  if (!(evidence instanceof File) || evidence.size === 0) return "Unggah tangkapan layar pemeriksaan sebagai bukti.";
  if (evidence.size > 5 * 1024 * 1024) return "Bukti maksimal 5 MB.";
  let image: Buffer;
  try {
    const input = Buffer.from(await evidence.arrayBuffer());
    const metadata = await sharp(input).metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) return "Bukti harus PNG, JPEG, atau WebP.";
    image = await sharp(input)
      .rotate()
      .resize({ width: 1800, height: 2600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return "Berkas bukti tidak dapat dibaca sebagai gambar.";
  }
  const relativePath = join("growth-audits", `${randomUUID()}.webp`);
  try {
    await writeFile(await preparePrivateDestination(relativePath), image, { flag: "wx", mode: 0o600 });
    await database.transaction(async (tx) => {
      const [saved] = await tx
        .insert(growthSearchAudits)
        .values({
          checkedAt: new Date(),
          location: "Bandung, Indonesia",
          device: "desktop",
          competitors,
          results,
          evidencePath: relativePath,
          evidenceChecksum: createHash("sha256").update(image).digest("hex"),
          createdBy: user.id,
        })
        .returning({ id: growthSearchAudits.id });
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "growth.search_audit_saved",
        entityType: "growth_search_audit",
        entityId: saved.id,
        metadata: { keywordCount: results.length, domains },
      });
    });
  } catch {
    await removePrivateFile(relativePath);
    return "Pemeriksaan belum tersimpan. Coba lagi tanpa mengubah bukti asli.";
  }
  revalidatePath("/admin/growth");
  revalidatePath("/admin/growth/competitors");
  return "Pemeriksaan mingguan tersimpan.";
}
