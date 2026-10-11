import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runIntegrationSync } from "@/features/integrations/sync-runner";

export async function POST(request: Request) {
  const expected = process.env.INTEGRATIONS_CRON_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedBytes = Buffer.from(expected ?? "");
  const suppliedBytes = Buffer.from(supplied);
  if (!expected || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await runIntegrationSync({ trigger: "scheduled" });
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
