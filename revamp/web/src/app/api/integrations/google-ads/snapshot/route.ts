import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { googleAdsSnapshotToken } from "@/features/integrations/google-ads-config";
import { createGoogleAdsSnapshot } from "@/features/integrations/google-ads-snapshot";

const requestSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

function secureRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return (forwarded || new URL(request.url).protocol.replace(":", "")) === "https";
}

function authorized(request: Request) {
  const expected = googleAdsSnapshotToken();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

const responseHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  if (!secureRequest(request))
    return Response.json({ error: "HTTPS required" }, { status: 400, headers: responseHeaders });
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: responseHeaders });
  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid range" }, { status: 400, headers: responseHeaders });
  try {
    const snapshot = await createGoogleAdsSnapshot(input.data.from, input.data.to);
    return Response.json(snapshot, { headers: responseHeaders });
  } catch {
    return Response.json({ error: "Snapshot unavailable" }, { status: 503, headers: responseHeaders });
  }
}
