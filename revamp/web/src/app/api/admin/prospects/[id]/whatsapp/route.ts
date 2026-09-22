import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, leads } from "@/lib/database/schema";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  const { id } = await params;
  const database = getDatabase();
  if (!user || !database) return NextResponse.redirect(new URL("/admin/login", request.url));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.redirect(new URL("/admin/prospects", request.url));
  }
  const [lead] = await database.select().from(leads).where(eq(leads.id, id));
  if (!lead) return NextResponse.redirect(new URL("/admin/prospects", request.url));
  await database.transaction(async (transaction) => {
    await transaction
      .insert(auditLogs)
      .values({ actorId: user.id, action: "prospect.whatsapp_started", entityType: "lead", entityId: lead.id });
  });
  const phone = lead.phone.replace(/\D/g, "").replace(/^0/, "62");
  const text = `Halo ${lead.name}, terima kasih sudah menghubungi Anugrah Plastik. Kami ingin memahami kebutuhan Anda: ${lead.message}`;
  return NextResponse.redirect(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`);
}
