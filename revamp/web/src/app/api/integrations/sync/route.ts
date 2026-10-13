import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runIntegrationSync, type SyncService } from "@/features/integrations/sync-runner";

function requestedServices(payload: unknown): SyncService[] | null {
  if (
    payload === null ||
    payload === undefined ||
    (typeof payload === "object" && !Array.isArray(payload) && !("services" in payload))
  )
    return ["mail", "ads"];
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("services" in payload)) return null;
  const services = (payload as { services?: unknown }).services;
  if (!Array.isArray(services) || services.length < 1 || services.length > 2) return null;
  const unique = [...new Set(services)];
  return unique.every((service): service is SyncService => service === "mail" || service === "ads") ? unique : null;
}

export async function POST(request: Request) {
  const expected = process.env.INTEGRATIONS_CRON_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedBytes = Buffer.from(expected ?? "");
  const suppliedBytes = Buffer.from(supplied);
  if (!expected || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const body = await request.json().catch(() => null);
    const services = requestedServices(body);
    if (!services)
      return NextResponse.json(
        { ok: false, error: "Invalid services" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    const result = await runIntegrationSync({ trigger: "scheduled", services });
    const failed = result.status === "failed";
    return NextResponse.json(
      {
        ok: !failed,
        runId: result.id,
        mail: { status: result.mail.status, count: result.mail.count, code: result.mail.code },
        ads: { status: result.ads.status, count: result.ads.count, code: result.ads.code },
      },
      { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Sync runner unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
