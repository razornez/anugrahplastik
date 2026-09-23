import { eq, sql } from "drizzle-orm";
import { analyticsIngestBatches, analyticsWorkerState } from "@/lib/database/schema";
import { getDatabase } from "@/lib/database/client";

export type AnalyticsHealth = {
  status: "normal" | "attention" | "upgrade";
  pendingBatches: number;
  failedBatches: number;
  oldestSeconds: number;
  workerSecondsAgo: number | null;
  message: string;
};

export async function getAnalyticsHealth(): Promise<AnalyticsHealth | null> {
  const database = getDatabase();
  if (!database) return null;

  const [queue, worker] = await Promise.all([
    database
      .select({
        pending: sql<number>`count(*) filter (where ${analyticsIngestBatches.status} in ('pending', 'processing'))`,
        failed: sql<number>`count(*) filter (where ${analyticsIngestBatches.status} = 'failed')`,
        oldestAt: sql<Date | null>`min(${analyticsIngestBatches.receivedAt}) filter (where ${analyticsIngestBatches.status} in ('pending', 'processing'))`,
      })
      .from(analyticsIngestBatches),
    database
      .select({ heartbeatAt: analyticsWorkerState.heartbeatAt })
      .from(analyticsWorkerState)
      .where(eq(analyticsWorkerState.name, "analytics-ingest"))
      .limit(1),
  ]);
  const now = Date.now();
  const pendingBatches = Number(queue[0]?.pending ?? 0);
  const failedBatches = Number(queue[0]?.failed ?? 0);
  const oldest = queue[0]?.oldestAt;
  const oldestSeconds = oldest ? Math.max(0, Math.round((now - oldest.getTime()) / 1000)) : 0;
  const heartbeat = worker[0]?.heartbeatAt;
  const workerSecondsAgo = heartbeat ? Math.max(0, Math.round((now - heartbeat.getTime()) / 1000)) : null;

  if (
    pendingBatches >= 2500 ||
    oldestSeconds > 60 ||
    failedBatches > 0 ||
    (workerSecondsAgo !== null && workerSecondsAgo > 45)
  ) {
    return {
      status: "upgrade",
      pendingBatches,
      failedBatches,
      oldestSeconds,
      workerSecondsAgo,
      message:
        "Antrean mulai mengganggu ketepatan laporan. Periksa worker; bila lonjakan berulang, siapkan Redis atau worker tambahan.",
    };
  }
  if (pendingBatches >= 500 || oldestSeconds > 10 || workerSecondsAgo === null) {
    return {
      status: "attention",
      pendingBatches,
      failedBatches,
      oldestSeconds,
      workerSecondsAgo,
      message: "Antrean masih aman untuk landing, tetapi perlu dipantau. Laporan dapat tertinggal sesaat.",
    };
  }
  return {
    status: "normal",
    pendingBatches,
    failedBatches,
    oldestSeconds,
    workerSecondsAgo,
    message: "Antrean sehat. Website dan formulir tetap diprioritaskan daripada pencatatan perilaku.",
  };
}
