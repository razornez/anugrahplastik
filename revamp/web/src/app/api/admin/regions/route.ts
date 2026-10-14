import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { regionOptions } from "@/features/operations/customer-profile-service";

const querySchema = z.object({
  level: z.enum(["province", "regency", "district", "village"]),
  parentCode: z.string().trim().max(20).optional(),
  q: z.string().trim().max(80).optional(),
});

export async function GET(request: Request) {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role))
    return Response.json({ message: "Tidak diizinkan." }, { status: 403 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    level: url.searchParams.get("level"),
    parentCode: url.searchParams.get("parentCode") || undefined,
    q: url.searchParams.get("q") || undefined,
  });
  if (!parsed.success) return Response.json({ message: "Permintaan wilayah tidak valid." }, { status: 400 });
  if (parsed.data.level !== "province" && !parsed.data.parentCode)
    return Response.json({ message: "Pilih wilayah induk terlebih dahulu." }, { status: 400 });
  return Response.json(
    {
      options: await regionOptions({
        level: parsed.data.level,
        parentCode: parsed.data.parentCode,
        query: parsed.data.q,
      }),
    },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
