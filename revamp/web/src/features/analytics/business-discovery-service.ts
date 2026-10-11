import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/database/client";
import {
  auditLogs,
  growthBusinessCandidates,
  growthBusinessMatches,
  growthBusinessSearches,
  growthMarketSignals,
  growthSeoAudits,
  leads,
  users,
} from "@/lib/database/schema";
import { monthKeyInJakarta, weekKeyInJakarta } from "./seo-benchmark";
import { monthlyLimit } from "./seo-audit-service";
import { reservedSearches } from "./search-discovery";
import { futureMondaysInMonth } from "./market-signals";
import {
  businessBudget,
  businessCacheFresh,
  businessSource,
  normalizeBusinessQuery,
  parseBusinessResults,
  safeBusinessWebsite,
  type BusinessBoardData,
  type BusinessCandidate,
  type BusinessResult,
  type BusinessReview,
} from "./business-discovery-model";

type Database = NonNullable<ReturnType<typeof getDatabase>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function quota(db: Database | Transaction, now: Date) {
  const month = monthKeyInJakarta(now);
  const week = weekKeyInJakarta(now);
  const usage = await db.execute(sql`SELECT used FROM growth_serp_usage WHERE month_key = ${month}`);
  const attempts = await db.execute(
    sql`SELECT count(*)::int AS total FROM growth_business_searches WHERE month_key = ${month}`,
  );
  const trend = await db
    .select({ id: growthMarketSignals.id })
    .from(growthMarketSignals)
    .where(eq(growthMarketSignals.weekKey, week))
    .limit(1);
  const organic = await db
    .select({ id: growthSeoAudits.id })
    .from(growthSeoAudits)
    .where(and(eq(growthSeoAudits.weekKey, week), eq(growthSeoAudits.status, "complete")))
    .limit(1);
  // Existing reservedSearches protects organic searches; also reserve each future weekly trend.
  const reserved = reservedSearches(now, Boolean(trend.length)) + futureMondaysInMonth(now) + (organic.length ? 0 : 6);
  return businessBudget(Number(usage.rows[0]?.used ?? 0), Number(attempts.rows[0]?.total ?? 0), reserved, monthlyLimit);
}

export async function getBusinessBoard(now = new Date()): Promise<BusinessBoardData> {
  const empty: BusinessBoardData = {
    evaluatedAt: now.toISOString(),
    available: false,
    error: "Data calon pelanggan belum tersedia. Periksa koneksi database dan migrasi.",
    candidates: [],
    searches: [],
    budget: null,
    members: [],
    configured: Boolean(process.env.SERPAPI_API_KEY),
  };
  const db = getDatabase();
  if (!db) return empty;
  try {
    const [searches, matches, members, budget] = await Promise.all([
      db.select().from(growthBusinessSearches).orderBy(desc(growthBusinessSearches.startedAt)).limit(12),
      db
        .select({ candidate: growthBusinessCandidates, cityId: growthBusinessSearches.cityId })
        .from(growthBusinessMatches)
        .innerJoin(growthBusinessCandidates, eq(growthBusinessCandidates.id, growthBusinessMatches.candidateId))
        .innerJoin(growthBusinessSearches, eq(growthBusinessSearches.id, growthBusinessMatches.searchId))
        .where(eq(growthBusinessSearches.status, "complete"))
        .orderBy(desc(growthBusinessCandidates.checkedAt)),
      db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.isActive, true), inArray(users.role, ["admin", "sales"]))),
      quota(db, now),
    ]);
    const candidates = new Map<string, BusinessCandidate>();
    for (const { candidate, cityId } of matches) {
      const existing = candidates.get(candidate.id);
      if (existing) {
        if (!existing.areas.includes(cityId)) existing.areas.push(cityId);
      } else
        candidates.set(candidate.id, {
          ...candidate,
          website: safeBusinessWebsite(candidate.website),
          status: candidate.status as BusinessReview,
          checkedAt: candidate.checkedAt.toISOString(),
          areas: [cityId],
        });
    }
    return {
      evaluatedAt: empty.evaluatedAt,
      available: true,
      error: null,
      configured: empty.configured,
      budget,
      members,
      candidates: [...candidates.values()],
      searches: searches.map((item) => ({
        id: item.id,
        phrase: item.phrase,
        cityId: item.cityId,
        status: item.status,
        count: item.resultCount,
        startedAt: item.startedAt.toISOString(),
        error: item.error,
      })),
    };
  } catch {
    return empty;
  }
}

export async function claimBusinessSearch(phrase: string, cityId: string, actorId: string, now = new Date()) {
  const input = normalizeBusinessQuery(phrase, cityId);
  const db = getDatabase();
  if (!db) throw new Error("Database belum terhubung.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.queryKey}))`);
    const previous = await tx
      .select()
      .from(growthBusinessSearches)
      .where(eq(growthBusinessSearches.queryKey, input.queryKey))
      .orderBy(desc(growthBusinessSearches.startedAt))
      .limit(1);
    const row = previous[0];
    if (row?.status === "running" && now.getTime() - row.startedAt.getTime() < 120_000)
      return { status: "running" as const, id: row.id, input };
    if (row?.status === "complete" && businessCacheFresh(row.checkedAt, now))
      return { status: "cached" as const, id: row.id, input };
    if (row?.status === "running")
      await tx
        .update(growthBusinessSearches)
        .set({
          status: "failed",
          error: "Pemeriksaan terputus. Hasil lama tetap tersedia; percobaan ini tetap memakai reservasi jatah.",
        })
        .where(eq(growthBusinessSearches.id, row.id));
    const month = monthKeyInJakarta(now);
    await tx.execute(sql`INSERT INTO growth_serp_usage (month_key, used) VALUES (${month}, 0) ON CONFLICT DO NOTHING`);
    await tx.execute(sql`SELECT used FROM growth_serp_usage WHERE month_key = ${month} FOR UPDATE`);
    const budget = await quota(tx, now);
    if (budget.available < 1)
      throw new Error(
        "Jatah pencarian perusahaan tidak tersedia. Batas empat permintaan dan cadangan audit tetap dilindungi.",
      );
    const id = randomUUID();
    await tx.execute(sql`UPDATE growth_serp_usage SET used = used + 1 WHERE month_key = ${month}`);
    await tx.insert(growthBusinessSearches).values({
      id,
      queryKey: input.queryKey,
      phrase: input.phrase,
      cityId: input.city.id,
      monthKey: month,
      status: "running",
      createdBy: actorId,
      startedAt: now,
    });
    await tx.insert(auditLogs).values({
      actorId,
      action: "business.search_started",
      entityType: "business_search",
      entityId: id,
      metadata: { phrase: input.phrase, city: input.city.id, requests: 1 },
    });
    return { status: "claimed" as const, id, input };
  });
}

async function readSearchResponse(response: Response) {
  if (!response.ok)
    throw new Error(`Sumber menolak pencarian (HTTP ${response.status}). Jatah tetap dicatat sebagai percobaan.`);
  if (!response.body) throw new Error("Respons pencarian kosong.");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 3_000_000) throw new Error("Respons pencarian terlalu besar untuk diproses dengan aman.");
      parts.push(part.value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function saveBusinessResults(
  searchId: string,
  items: BusinessResult[],
  actorId: string,
  now = new Date(),
) {
  const db = getDatabase();
  if (!db) throw new Error("Database belum terhubung.");
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM growth_business_searches WHERE id = ${searchId} FOR UPDATE`);
    const [search] = await tx.select().from(growthBusinessSearches).where(eq(growthBusinessSearches.id, searchId));
    if (!search || search.status !== "running") throw new Error("Pencarian ini sudah diselesaikan atau dibatalkan.");
    for (const item of items) {
      const value = { ...item, checkedAt: now };
      const [candidate] = item.stableId
        ? await tx
            .insert(growthBusinessCandidates)
            .values(value)
            .onConflictDoUpdate({ target: growthBusinessCandidates.stableId, set: value })
            .returning({ id: growthBusinessCandidates.id })
        : await tx.insert(growthBusinessCandidates).values(value).returning({ id: growthBusinessCandidates.id });
      await tx.insert(growthBusinessMatches).values({ searchId, candidateId: candidate.id, snapshot: item });
    }
    await tx
      .update(growthBusinessSearches)
      .set({ status: "complete", checkedAt: now, resultCount: items.length })
      .where(eq(growthBusinessSearches.id, searchId));
    await tx.insert(auditLogs).values({
      actorId,
      action: "business.search_completed",
      entityType: "business_search",
      entityId: searchId,
      metadata: { results: items.length },
    });
  });
}

export async function runBusinessSearch(phrase: string, cityId: string, actorId: string, now = new Date()) {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_API_KEY belum tersedia dalam konfigurasi privat.");
  const claimed = await claimBusinessSearch(phrase, cityId, actorId, now);
  if (claimed.status === "cached")
    return "Hasil pencarian tujuh hari terakhir digunakan. Tidak ada jatah tambahan terpakai.";
  if (claimed.status === "running") return "Pencarian yang sama sedang berjalan. Tidak ada permintaan API tambahan.";
  try {
    const url = new URL("https://serpapi.com/search.json");
    url.search = new URLSearchParams({
      engine: "google_maps",
      type: "search",
      q: `${claimed.input.phrase} ${claimed.input.city.label}, Indonesia`,
      hl: "id",
      ll: `@${claimed.input.city.lat},${claimed.input.city.lon},11z`,
      api_key: key,
    }).toString();
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45000) });
    const items = parseBusinessResults(await readSearchResponse(response), claimed.input.city.label);
    await saveBusinessResults(claimed.id, items, actorId, now);
    return items.length
      ? `${items.length} hasil ditemukan. Tinjau relevansinya sebelum menambahkan ke Prospek.`
      : "Pencarian selesai, tetapi sumber tidak memberikan hasil. Coba frasa lain pada pemeriksaan berikutnya.";
  } catch {
    // Never log or serialize fetch errors: request URLs contain the private key.
    const db = getDatabase();
    const message =
      "Pencarian belum berhasil. Hasil sebelumnya tetap tersedia; satu percobaan tetap dicatat dalam jatah internal.";
    if (db)
      await db.transaction(async (tx) => {
        await tx
          .update(growthBusinessSearches)
          .set({ status: "failed", error: message })
          .where(and(eq(growthBusinessSearches.id, claimed.id), eq(growthBusinessSearches.status, "running")));
        await tx.insert(auditLogs).values({
          actorId,
          action: "business.search_failed",
          entityType: "business_search",
          entityId: claimed.id,
          metadata: { reason: "source_or_storage_failure" },
        });
      });
    return message;
  }
}

export async function reviewBusinessCandidate(candidateId: string, status: BusinessReview, actorId: string) {
  const db = getDatabase();
  if (!db) throw new Error("Database belum terhubung.");
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(growthBusinessCandidates)
      .set({ status, updatedBy: actorId })
      .where(eq(growthBusinessCandidates.id, candidateId))
      .returning({ id: growthBusinessCandidates.id });
    if (!updated.length) throw new Error("Kandidat tidak ditemukan.");
    await tx.insert(auditLogs).values({
      actorId,
      action: "business.candidate_reviewed",
      entityType: "business_candidate",
      entityId: candidateId,
      metadata: { status },
    });
  });
}

export async function addBusinessProspect(candidateId: string, assignedUserId: string, actorId: string) {
  const db = getDatabase();
  if (!db) throw new Error("Database belum terhubung.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM growth_business_candidates WHERE id = ${candidateId} FOR UPDATE`);
    const [candidate] = await tx
      .select()
      .from(growthBusinessCandidates)
      .where(eq(growthBusinessCandidates.id, candidateId));
    if (!candidate?.stableId)
      throw new Error(
        "Identitas tempat belum stabil. Konfirmasikan identitas dari sumber sebelum menambahkan ke Prospek.",
      );
    if (candidate.leadId) return candidate.leadId;
    const [member] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, assignedUserId), eq(users.isActive, true), inArray(users.role, ["admin", "sales"])));
    if (!member) throw new Error("Pilih penanggung jawab admin/sales yang aktif.");
    const [lead] = await tx
      .insert(leads)
      .values({
        name: candidate.name,
        phone: candidate.phone,
        email: null,
        source: businessSource,
        assignedUserId,
        message: `Kandidat hasil riset perusahaan, belum menghubungi Anugrah Plastik. Kategori publik: ${candidate.category ?? "belum tersedia"}. Alamat publik: ${candidate.address ?? "belum tersedia"}. Kebutuhan produk belum dikonfirmasi.`,
        referrer: candidate.mapsUrl,
        attribution: {
          candidateId,
          stableId: candidate.stableId,
          checkedAt: candidate.checkedAt.toISOString(),
          website: candidate.website,
        },
      })
      .returning({ id: leads.id });
    await tx
      .update(growthBusinessCandidates)
      .set({ leadId: lead.id, status: "relevant", updatedBy: actorId })
      .where(eq(growthBusinessCandidates.id, candidateId));
    await tx.insert(auditLogs).values({
      actorId,
      action: "business.prospect_added",
      entityType: "lead",
      entityId: lead.id,
      metadata: { candidateId, source: businessSource, assignedUserId },
    });
    return lead.id;
  });
}
