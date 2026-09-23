import { z } from "zod";

const cursorSchema = z.object({ createdAt: z.string().datetime(), id: z.string().uuid() });

export type TimeCursor = z.infer<typeof cursorSchema>;

export function decodeTimeCursor(value: string | undefined): TimeCursor | null {
  if (!value || value.length > 300) return null;
  try {
    return cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))).data ?? null;
  } catch {
    return null;
  }
}

export function encodeTimeCursor(value: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: value.createdAt.toISOString(), id: value.id })).toString("base64url");
}
