import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/client";
import { leads } from "@/lib/database/schema";
import { clientAddress, takeRateLimit } from "@/lib/security/rate-limit";
import { leadFormSchema } from "@/features/leads/schema";
import { campaignLeadSource } from "@/features/leads/attribution";

export async function POST(request: Request) {
  const address = clientAddress(request.headers);
  const rate = takeRateLimit(`lead:${address}`, 5, 15 * 60 * 1_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { message: "Terlalu banyak permintaan. Silakan coba lagi beberapa saat lagi." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = leadFormSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (["name", "phone", "message"].includes(field) && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return NextResponse.json({ message: "Periksa isian yang ditandai.", fieldErrors }, { status: 400 });
  }
  if (parsed.data.website) {
    return NextResponse.json({ message: "Data belum dapat diproses." }, { status: 400 });
  }

  const database = getDatabase();
  if (!database) {
    return NextResponse.json({ message: "Penyimpanan formulir belum tersedia." }, { status: 503 });
  }

  try {
    const referrer = (() => {
      if (!parsed.data.referrer) return null;
      try {
        const url = new URL(parsed.data.referrer);
        return ["http:", "https:"].includes(url.protocol) &&
          url.host.toLowerCase() !== request.headers.get("host")?.toLowerCase()
          ? `${url.origin}${url.pathname}`.slice(0, 1000)
          : null;
      } catch {
        return null;
      }
    })();
    const [lead] = await database
      .insert(leads)
      .values({
        name: parsed.data.name,
        phone: parsed.data.phone,
        message: parsed.data.message,
        landingPath: parsed.data.landingPath || null,
        referrer,
        attribution: parsed.data.attribution ?? null,
        source: campaignLeadSource(parsed.data.attribution),
      })
      .returning({ id: leads.id });
    if (!lead) throw new Error("Lead tidak dapat dibuat.");
    return NextResponse.json({ ok: true, conversionId: lead.id }, { status: 201 });
  } catch {
    return NextResponse.json({ message: "Permintaan belum dapat disimpan. Silakan coba lagi." }, { status: 500 });
  }
}
