import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/client";
import { leads } from "@/lib/database/schema";
import { clientAddress, takeRateLimit } from "@/lib/security/rate-limit";
import { leadFormSchema } from "@/features/leads/schema";

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
  if (!parsed.success || parsed.data.website) {
    return NextResponse.json({ message: "Data belum dapat diproses." }, { status: 400 });
  }

  const database = getDatabase();
  if (!database) {
    return NextResponse.json({ message: "Penyimpanan formulir belum tersedia." }, { status: 503 });
  }

  try {
    const [lead] = await database
      .insert(leads)
      .values({
        name: parsed.data.name,
        phone: parsed.data.phone,
        message: parsed.data.message,
        landingPath: parsed.data.landingPath || null,
        referrer: request.headers.get("referer"),
        attribution: parsed.data.attribution ?? null,
      })
      .returning({ id: leads.id });
    if (!lead) throw new Error("Lead tidak dapat dibuat.");
    return NextResponse.json({ ok: true, conversionId: lead.id }, { status: 201 });
  } catch {
    return NextResponse.json({ message: "Permintaan belum dapat disimpan. Silakan coba lagi." }, { status: 500 });
  }
}
