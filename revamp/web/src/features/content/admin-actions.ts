"use server";

import { eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { compare, hash } from "bcryptjs";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, contentBlocks, contentRevisions, users } from "@/lib/database/schema";
import { clearSession, createSession, getSession, type SessionUser } from "@/lib/auth/session";
import { clientAddress, takeRateLimit } from "@/lib/security/rate-limit";
import { LANDING_CONTENT_KEY, landingContentSchema, type LandingContent } from "./landing-content";

function canManageContent(user: SessionUser | null): user is SessionUser {
  return Boolean(user);
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
  const pin = String(formData.get("pin") || "");
  const requestHeaders = await headers();
  const addressRate = takeRateLimit(`login:${clientAddress(requestHeaders)}`, 8, 15 * 60 * 1_000);
  const accountRate = takeRateLimit(`login-account:${email}`, 8, 15 * 60 * 1_000);
  if (!addressRate.allowed || !accountRate.allowed) redirect("/admin/login?error=rate-limit");
  const database = getDatabase();
  if (!database) redirect("/admin/login?error=database");

  let [user] = await database.select().from(users).where(eq(users.email, email));

  const initialEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!user && !pin && initialEmail === email && initialPassword === password) {
    [user] = await database
      .insert(users)
      .values({ email, name: "Administrator", passwordHash: await hash(password, 12), role: "admin" })
      .returning();
  }

  const authenticated = pin
    ? Boolean(user?.pinHash) && (await compare(pin, user.pinHash!))
    : Boolean(user) && (await compare(password, user!.passwordHash));
  if (!user || !user.isActive || !authenticated) redirect("/admin/login?error=credentials");

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

  const parsed = landingContentSchema.safeParse({
    metadata: { title: formData.get("metadata.title"), description: formData.get("metadata.description") },
    topbar: { promise: formData.get("topbar.promise") },
    hero: {
      titleBefore: formData.get("hero.titleBefore"),
      titleHighlight: formData.get("hero.titleHighlight"),
      titleAfter: formData.get("hero.titleAfter"),
      description: formData.get("hero.description"),
      primaryCta: formData.get("hero.primaryCta"),
      secondaryCta: formData.get("hero.secondaryCta"),
    },
    about: { title: formData.get("about.title"), body: formData.get("about.body") },
    why: { title: formData.get("why.title") },
    process: { title: formData.get("process.title") },
    material: { title: formData.get("material.title"), primaryCta: formData.get("material.primaryCta") },
    portfolio: { title: formData.get("portfolio.title") },
    faq: {
      title: formData.get("faq.title"),
      description: formData.get("faq.description"),
      primaryCta: formData.get("faq.primaryCta"),
    },
    contact: {
      title: formData.get("contact.title"),
      description: formData.get("contact.description"),
      formTitle: formData.get("contact.formTitle"),
      formDescription: formData.get("contact.formDescription"),
      primaryCta: formData.get("contact.primaryCta"),
    },
    footer: { description: formData.get("footer.description") },
  });

  if (!parsed.success) {
    redirect("/admin/content?error=content");
  }
  const content: LandingContent = parsed.data;

  const action = String(formData.get("action") || "draft") === "publish" ? "publish" : "draft";
  const [existing] = await database.select().from(contentBlocks).where(eq(contentBlocks.key, LANDING_CONTENT_KEY));
  const version = (existing?.version ?? 0) + 1;
  const [block] = await database.transaction(async (transaction) => {
    const payload = {
      content,
      draftContent: content,
      ...(action === "publish"
        ? { publishedContent: content, status: "published", publishedAt: new Date() }
        : { status: existing?.publishedContent ? "published" : "draft", publishedAt: existing?.publishedAt ?? null }),
      version,
      updatedAt: new Date(),
    };
    const [saved] = existing
      ? await transaction.update(contentBlocks).set(payload).where(eq(contentBlocks.id, existing.id)).returning()
      : await transaction
          .insert(contentBlocks)
          .values({ key: LANDING_CONTENT_KEY, ...payload })
          .returning();

    await transaction
      .insert(contentRevisions)
      .values({ contentBlockId: saved.id, content, version, action, actorId: user.id });
    await transaction.insert(auditLogs).values({
      actorId: user.id,
      action: `content.${action}`,
      entityType: "content_block",
      entityId: saved.id,
      metadata: { key: LANDING_CONTENT_KEY, version },
    });
    return [saved];
  });

  if (action === "publish" && block) {
    updateTag("landing.page");
    revalidatePath("/");
  }
  redirect(`/admin/content?status=${action}`);
}
