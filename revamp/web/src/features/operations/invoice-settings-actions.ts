"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, invoiceIssuerSettings, invoiceNumberCounters } from "@/lib/database/schema";
import { readInvoiceLogo } from "./invoice-logo";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

async function admin() {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  return user;
}

const profileSchema = z.object({
  legalName: z.string().min(3).max(180),
  address: z.string().min(8).max(1000),
  phone: z.string().min(6).max(60),
  email: z.email().max(255),
  website: z.string().max(255),
  taxId: z.string().max(40),
  bankName: z.string().min(2).max(100),
  bankAccountNo: z.string().min(5).max(80),
  bankAccountName: z.string().min(3).max(180),
  signerName: z.string().min(3).max(120),
  signerTitle: z.string().min(2).max(100),
  logoPath: z.enum([
    "/brand/quotation-logo.png",
    "/brand/anugrah-plastik-social-logo-v1.png",
    "/brand/anugrah-plastik-mark.png",
  ]),
});

export async function saveInvoiceIssuer(formData: FormData) {
  const user = await admin();
  const parsed = profileSchema.safeParse(
    Object.fromEntries(Object.keys(profileSchema.shape).map((name) => [name, text(formData, name)])),
  );
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "form");
    redirect(`/admin/settings/invoice?error=validation&field=${encodeURIComponent(field)}`);
  }
  const data = parsed.data;
  const database = getDatabase();
  if (!database) redirect("/admin/settings/invoice?error=database");
  try {
    await database.transaction(async (tx) => {
      await tx
        .insert(invoiceIssuerSettings)
        .values({ id: 1, ...data, approvedAt: null, approvedBy: null })
        .onConflictDoUpdate({
          target: invoiceIssuerSettings.id,
          set: { ...data, approvedAt: null, approvedBy: null, updatedAt: new Date() },
        });
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "invoice.issuer_updated",
        entityType: "invoice_settings",
        entityId: "1",
        metadata: { fields: Object.keys(data) },
      });
    });
  } catch {
    redirect("/admin/settings/invoice?error=save");
  }
  revalidatePath("/admin/settings/invoice");
  redirect("/admin/settings/invoice?saved=1");
}

export async function approveInvoiceIssuer(formData: FormData) {
  const user = await admin();
  if (text(formData, "reviewed") !== "yes") redirect("/admin/settings/invoice?error=review");
  const database = getDatabase();
  if (!database) redirect("/admin/settings/invoice?error=database");
  let settings: typeof invoiceIssuerSettings.$inferSelect | undefined;
  try {
    [settings] = await database.select().from(invoiceIssuerSettings).where(eq(invoiceIssuerSettings.id, 1));
  } catch {
    redirect("/admin/settings/invoice?error=database");
  }
  if (!settings) redirect("/admin/settings/invoice?error=missing");
  const parsed = profileSchema.safeParse(settings);
  if (!parsed.success) redirect("/admin/settings/invoice?error=validation");
  try {
    await readInvoiceLogo(parsed.data.logoPath);
  } catch {
    redirect("/admin/settings/invoice?error=logo");
  }
  try {
    await database.transaction(async (tx) => {
      const [approved] = await tx
        .update(invoiceIssuerSettings)
        .set({ approvedAt: new Date(), approvedBy: user.id, updatedAt: new Date() })
        .where(eq(invoiceIssuerSettings.id, 1))
        .returning({ id: invoiceIssuerSettings.id });
      if (!approved) throw new Error("missing settings");
      await tx
        .insert(auditLogs)
        .values({ actorId: user.id, action: "invoice.issuer_approved", entityType: "invoice_settings", entityId: "1" });
    });
  } catch {
    redirect("/admin/settings/invoice?error=save");
  }
  revalidatePath("/admin/settings/invoice");
  redirect("/admin/settings/invoice?approved=1");
}

export async function initializeInvoiceCounter(formData: FormData) {
  const user = await admin();
  const counter = z
    .object({
      year: z.coerce.number().int().min(2020).max(2100),
      lastValue: z.coerce.number().int().min(0).max(999999),
    })
    .safeParse({ year: text(formData, "year"), lastValue: text(formData, "lastValue") });
  if (!counter.success) redirect("/admin/settings/invoice?error=counter-validation");
  const { year, lastValue } = counter.data;
  const database = getDatabase();
  if (!database) redirect("/admin/settings/invoice?error=database");
  try {
    await database.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(invoiceNumberCounters)
        .values({ referenceYear: year, lastValue, initializedBy: user.id })
        .onConflictDoNothing()
        .returning({ referenceYear: invoiceNumberCounters.referenceYear });
      if (!inserted) throw new Error("counter exists");
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "invoice.counter_initialized",
        entityType: "invoice_counter",
        entityId: String(year),
        metadata: { lastValue },
      });
    });
  } catch {
    redirect("/admin/settings/invoice?error=counter-exists");
  }
  revalidatePath("/admin/settings/invoice");
  redirect("/admin/settings/invoice?counter=1");
}
