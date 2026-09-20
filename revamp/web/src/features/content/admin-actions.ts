"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { compare, hash } from "bcryptjs";
import { getDatabase } from "@/lib/database/client";
import { contentBlocks, contentRevisions, users } from "@/lib/database/schema";
import { clearSession, createSession, getSession, type SessionUser } from "@/lib/auth/session";
import { LANDING_CONTENT_KEY, type LandingContent } from "./landing-content";

function canManageContent(user: SessionUser | null): user is SessionUser {
  return user?.role === "admin" || user?.role === "content";
}

async function requireContentManager() {
  const user = await getSession();
  if (canManageContent(user)) return user;
  redirect("/admin/login");
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");
  const database = getDatabase();
  if (!database) redirect("/admin/login?error=database");

  let [user] = await database.select().from(users).where(eq(users.email, email));

  const initialEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!user && initialEmail === email && initialPassword === password) {
    [user] = await database
      .insert(users)
      .values({ email, name: "Administrator", passwordHash: await hash(password, 12), role: "admin" })
      .returning();
  }

  if (!user || !user.isActive || !(await compare(password, user.passwordHash)))
    redirect("/admin/login?error=credentials");

  await createSession({ id: user.id, name: user.name, email: user.email, role: user.role as SessionUser["role"] });
  redirect("/admin/content");
}

export async function logout() {
  await clearSession();
  redirect("/admin/login");
}

export async function saveLandingContent(formData: FormData) {
  const user = await requireContentManager();
  const database = getDatabase();
  if (!database) redirect("/admin/content?error=database");

  let content: LandingContent;
  try {
    content = JSON.parse(String(formData.get("content") || "{}")) as LandingContent;
    if (!content.metadata?.title || !content.metadata?.description || !content.bindings) throw new Error("invalid");
  } catch {
    redirect("/admin/content?error=content");
  }

  const action = String(formData.get("action") || "draft") === "publish" ? "publish" : "draft";
  const [existing] = await database.select().from(contentBlocks).where(eq(contentBlocks.key, LANDING_CONTENT_KEY));
  const version = (existing?.version ?? 0) + 1;
  const payload = {
    content,
    status: action === "publish" ? "published" : "draft",
    version,
    publishedAt: action === "publish" ? new Date() : (existing?.publishedAt ?? null),
    updatedAt: new Date(),
  };

  const [block] = existing
    ? await database.update(contentBlocks).set(payload).where(eq(contentBlocks.id, existing.id)).returning()
    : await database
        .insert(contentBlocks)
        .values({ key: LANDING_CONTENT_KEY, ...payload })
        .returning();

  await database
    .insert(contentRevisions)
    .values({ contentBlockId: block.id, content, version, action, actorId: user.id });
  revalidatePath("/");
  redirect(`/admin/content?status=${action}`);
}
