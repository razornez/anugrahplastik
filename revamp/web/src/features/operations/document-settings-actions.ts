"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import {
  auditLogs,
  deliveryNumberCounters,
  documentTemplateVersions,
  handoverNumberCounters,
  invoiceIssuerSettings,
  invoiceNumberCounters,
  quotationNumberCounters,
} from "@/lib/database/schema";
import {
  activateDocumentTemplate,
  documentTemplateKinds,
  parseDocumentTemplateForm,
  type DocumentTemplateKind,
} from "./document-templates";
import { readInvoiceLogo } from "./invoice-logo";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

async function admin() {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  return user;
}

function refreshDocumentRoutes() {
  revalidatePath("/admin/settings/documents");
  revalidatePath("/admin/settings/templates");
  revalidatePath("/admin/settings/quotation");
  revalidatePath("/admin/settings/invoice");
  revalidatePath("/admin/settings/delivery");
  revalidatePath("/admin/settings/handover");
  revalidatePath("/admin/transactions");
  revalidatePath("/admin/transactions/[id]", "page");
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

export async function saveAndActivateIssuer(formData: FormData) {
  const user = await admin();
  const parsed = profileSchema.safeParse(
    Object.fromEntries(Object.keys(profileSchema.shape).map((name) => [name, text(formData, name)])),
  );
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "form");
    redirect(`/admin/settings/documents?section=identity&error=identity-validation&field=${encodeURIComponent(field)}`);
  }
  try {
    await readInvoiceLogo(parsed.data.logoPath);
  } catch {
    redirect("/admin/settings/documents?section=identity&error=logo");
  }
  const database = getDatabase();
  if (!database) redirect("/admin/settings/documents?section=identity&error=database");
  try {
    await database.transaction(async (tx) => {
      await tx
        .insert(invoiceIssuerSettings)
        .values({ id: 1, ...parsed.data, approvedAt: new Date(), approvedBy: user.id })
        .onConflictDoUpdate({
          target: invoiceIssuerSettings.id,
          set: { ...parsed.data, approvedAt: new Date(), approvedBy: user.id, updatedAt: new Date() },
        });
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "documents.issuer_activated",
        entityType: "document_settings",
        entityId: "issuer",
        metadata: { fields: Object.keys(parsed.data) },
      });
    });
  } catch {
    redirect("/admin/settings/documents?section=identity&error=save");
  }
  refreshDocumentRoutes();
  redirect("/admin/settings/documents?section=identity&status=identity-saved");
}

const counterSchema = z.object({
  kind: z.enum(documentTemplateKinds),
  year: z.coerce.number().int().min(2020).max(2100),
  lastValue: z.coerce.number().int().min(0).max(999999),
});

export async function initializeDocumentCounter(formData: FormData) {
  const user = await admin();
  const parsed = counterSchema.safeParse({
    kind: text(formData, "kind"),
    year: text(formData, "year"),
    lastValue: text(formData, "lastValue"),
  });
  if (!parsed.success) redirect("/admin/settings/documents?section=numbers&error=counter-validation");
  const database = getDatabase();
  if (!database) redirect("/admin/settings/documents?section=numbers&error=database");
  const tables = {
    quotation: quotationNumberCounters,
    invoice: invoiceNumberCounters,
    delivery: deliveryNumberCounters,
    handover: handoverNumberCounters,
  } as const;
  const table = tables[parsed.data.kind];
  try {
    await database.transaction(async (tx) => {
      const [created] = await tx
        .insert(table)
        .values({
          referenceYear: parsed.data.year,
          lastValue: parsed.data.lastValue,
          initializedBy: user.id,
        })
        .onConflictDoNothing()
        .returning({ referenceYear: table.referenceYear });
      if (!created) throw new Error("exists");
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: `${parsed.data.kind}.counter_initialized`,
        entityType: "document_counter",
        entityId: `${parsed.data.kind}:${parsed.data.year}`,
        metadata: { lastValue: parsed.data.lastValue },
      });
    });
  } catch {
    redirect("/admin/settings/documents?section=numbers&error=counter-exists");
  }
  refreshDocumentRoutes();
  redirect(`/admin/settings/documents?section=numbers&status=counter-saved&kind=${parsed.data.kind}`);
}

export async function saveDocumentTemplate(formData: FormData) {
  const user = await admin();
  const kindValue = text(formData, "kind");
  if (!documentTemplateKinds.includes(kindValue as DocumentTemplateKind)) {
    redirect("/admin/settings/templates?area=pdf&error=kind");
  }
  const kind = kindValue as DocumentTemplateKind;
  const parsed = parseDocumentTemplateForm(kind, formData);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "form");
    redirect(`/admin/settings/templates?area=pdf&kind=${kind}&error=validation&field=${encodeURIComponent(field)}`);
  }
  try {
    const result = await activateDocumentTemplate({ kind, config: parsed.data, actorId: user.id });
    const database = getDatabase();
    await database?.insert(auditLogs).values({
      actorId: user.id,
      action: "document_template.activated",
      entityType: "document_template",
      entityId: result.id,
      metadata: { kind, version: result.version, providerTemplateId: result.providerTemplateId },
    });
  } catch {
    redirect(`/admin/settings/templates?area=pdf&kind=${kind}&error=publish`);
  }
  refreshDocumentRoutes();
  redirect(`/admin/settings/templates?area=pdf&kind=${kind}&status=saved`);
}

export async function restoreDocumentTemplate(formData: FormData) {
  const user = await admin();
  const id = z.uuid().safeParse(text(formData, "versionId"));
  if (!id.success) redirect("/admin/settings/templates?area=pdf&error=version");
  const database = getDatabase();
  if (!database) redirect("/admin/settings/templates?area=pdf&error=database");
  const [source] = await database
    .select()
    .from(documentTemplateVersions)
    .where(eq(documentTemplateVersions.id, id.data))
    .limit(1);
  if (!source || !documentTemplateKinds.includes(source.kind as DocumentTemplateKind)) {
    redirect("/admin/settings/templates?area=pdf&error=version");
  }
  const kind = source.kind as DocumentTemplateKind;
  try {
    await activateDocumentTemplate({ kind, config: source.config, actorId: user.id, restoredFromId: source.id });
  } catch {
    redirect(`/admin/settings/templates?area=pdf&kind=${kind}&error=publish`);
  }
  refreshDocumentRoutes();
  redirect(`/admin/settings/templates?area=pdf&kind=${kind}&status=restored`);
}
