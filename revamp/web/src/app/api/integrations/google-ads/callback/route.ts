import { and, eq, gt } from "drizzle-orm";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, integrationOauthStates, integrations } from "@/lib/database/schema";
import { encryptSecret, hasIntegrationEncryptionKey } from "@/features/integrations/secrets";
import {
  googleAdsCustomerId,
  googleAdsExpectedEmail,
  googleAdsRedirectUri,
} from "@/features/integrations/google-ads-config";
import { verifyGoogleAdsAccessToken } from "@/features/integrations/google-ads-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const origin = new URL(googleAdsRedirectUri()).origin;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/admin/settings/integrations?error=${encodeURIComponent(reason)}`, origin));
  if (error || !code || !state || state.length > 256) return fail("google-cancelled");
  const database = getDatabase();
  const stateHash = createHash("sha256").update(state).digest("hex");
  const [record] = database
    ? await database
        .select()
        .from(integrationOauthStates)
        .where(and(eq(integrationOauthStates.stateHash, stateHash), gt(integrationOauthStates.expiresAt, new Date())))
        .limit(1)
    : [];
  if (!database || !record) return fail("google-state");
  await database.delete(integrationOauthStates).where(eq(integrationOauthStates.stateHash, stateHash));

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const redirectUri = googleAdsRedirectUri();
  if (!clientId || !clientSecret || !hasIntegrationEncryptionKey()) return fail("google-config");
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) return fail("google-token");
    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
      token_type: string;
      id_token?: string;
    };
    const expectedEmail = googleAdsExpectedEmail();
    if (
      !tokens.access_token ||
      !tokens.refresh_token ||
      !tokens.id_token ||
      !expectedEmail ||
      !tokens.scope?.split(" ").includes("https://www.googleapis.com/auth/adwords")
    )
      return fail("google-token-scope");
    const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
    const verified = await jwtVerify(tokens.id_token, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    if (
      verified.payload.email_verified !== true ||
      String(verified.payload.email ?? "").toLowerCase() !== expectedEmail
    )
      return fail("google-account");
    // Test this access token before replacing an otherwise usable refresh token.
    // A failed MCC/API configuration must not disconnect the previous connection.
    let probe;
    try {
      probe = await verifyGoogleAdsAccessToken(tokens.access_token);
    } catch {
      return fail("google-api-access");
    }
    const [existing] = await database
      .select({ metadata: integrations.metadata })
      .from(integrations)
      .where(eq(integrations.key, "google-ads"))
      .limit(1);
    const existingMetadata = (existing?.metadata ?? {}) as Record<string, unknown>;
    const verifiedAt = new Date().toISOString();
    const metadata = {
      ...existingMetadata,
      customerId: googleAdsCustomerId(),
      accountName: probe.name,
      adsAccountTimeZone: probe.timeZone,
      scope: "adwords",
      authorizedEmail: expectedEmail,
      lastProbeAt: verifiedAt,
      lastProbeCode: "success",
    };
    const encrypted = encryptSecret({ refreshToken: tokens.refresh_token });
    await database
      .insert(integrations)
      .values({
        key: "google-ads",
        status: "connected",
        secretCiphertext: encrypted,
        metadata,
        updatedBy: record.actorId,
        lastError: null,
      })
      .onConflictDoUpdate({
        target: integrations.key,
        set: {
          status: "connected",
          secretCiphertext: encrypted,
          metadata,
          updatedBy: record.actorId,
          updatedAt: new Date(),
          lastError: null,
        },
      });
    await database.insert(auditLogs).values({
      actorId: record.actorId,
      action: "integration.google_ads_connected",
      entityType: "integration",
      entityId: "google-ads",
      metadata: { customerId: googleAdsCustomerId() },
    });
    return NextResponse.redirect(new URL("/admin/settings/integrations?saved=google-ads", origin));
  } catch {
    return fail("google-token");
  }
}
