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
  if (!user || user.role !== "admin") throw new Error("Hanya administrator yang dapat mengubah pengaturan invoice.");
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
  logoPath: z.string().regex(/^\/[a-zA-Z0-9/_-]+\.(?:png|webp)$/),
});

export async function saveInvoiceIssuer(formData: FormData) {
  const user = await admin();
  const data = profileSchema.parse(
    Object.fromEntries(Object.keys(profileSchema.shape).map((name) => [name, text(formData, name)])),
  );
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
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
  revalidatePath("/admin/settings/invoice");
  redirect("/admin/settings/invoice?saved=1");
}

export async function approveInvoiceIssuer(formData: FormData) {
  const user = await admin();
  if (text(formData, "reviewed") !== "yes") throw new Error("Konfirmasi pemeriksaan identitas diperlukan.");
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  const [settings] = await database.select().from(invoiceIssuerSettings).where(eq(invoiceIssuerSettings.id, 1));
  if (!settings) throw new Error("Isi identitas penerbit terlebih dahulu.");
  profileSchema.parse(settings);
  await readInvoiceLogo(settings.logoPath);
  await database.transaction(async (tx) => {
    const [approved] = await tx
      .update(invoiceIssuerSettings)
      .set({ approvedAt: new Date(), approvedBy: user.id, updatedAt: new Date() })
      .where(eq(invoiceIssuerSettings.id, 1))
      .returning({ id: invoiceIssuerSettings.id });
    if (!approved) throw new Error("Isi dan periksa identitas penerbit terlebih dahulu.");
    await tx
      .insert(auditLogs)
      .values({ actorId: user.id, action: "invoice.issuer_approved", entityType: "invoice_settings", entityId: "1" });
  });
  revalidatePath("/admin/settings/invoice");
  redirect("/admin/settings/invoice?approved=1");
}

export async function initializeInvoiceCounter(formData: FormData) {
  const user = await admin();
  const year = z.coerce.number().int().min(2020).max(2100).parse(text(formData, "year"));
  const lastValue = z.coerce.number().int().min(0).max(999999).parse(text(formData, "lastValue"));
  const database = getDatabase();
  if (!database) throw new Error("Database belum terhubung.");
  await database.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(invoiceNumberCounters)
      .values({ referenceYear: year, lastValue, initializedBy: user.id })
      .onConflictDoNothing()
      .returning({ referenceYear: invoiceNumberCounters.referenceYear });
    if (!inserted)
      throw new Error("Counter tahun ini sudah dibuat dan tidak boleh direset. Periksa nomor terakhir secara manual.");
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "invoice.counter_initialized",
      entityType: "invoice_counter",
      entityId: String(year),
      metadata: { lastValue },
    });
  });
  revalidatePath("/admin/settings/invoice");
  redirect("/admin/settings/invoice?counter=1");
}
