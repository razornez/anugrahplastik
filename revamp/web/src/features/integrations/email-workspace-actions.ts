"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { businessTransactions, customerContacts, transactionDocuments } from "@/lib/database/schema";
import {
  createDraft,
  copyDraft,
  saveDraft,
  prepareDraft,
  sendPreparedDraft,
  removeDraftFile,
  retryRejectedRecipients,
  type DraftPayload,
} from "./email-drafts";
import { getEmailRecord, getMailboxSettings } from "./mail-service";
import { fillEmailSubject, fillEmailTemplate, getActiveTemplate, type EmailNode } from "./email-templates";
import { parseRecipients, replyRecipients } from "./email-workspace-model";

export async function createTransactionEmailDraft(input: {
  transactionId: string;
  documentId: string;
  templateId: string;
  language: string;
  to: string;
  cc: string;
  subject: string;
  content: EmailNode;
  saveContacts?: boolean;
  confirmOtherPic?: boolean;
}) {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role)) throw new Error("Akses ditolak.");
  const parsed = z
    .object({
      transactionId: z.uuid(),
      documentId: z.uuid(),
      templateId: z.uuid(),
      language: z.string().min(2).max(10),
      to: z.string().max(5500),
      cc: z.string().max(5500),
      subject: z
        .string()
        .trim()
        .min(1)
        .max(998)
        .refine((value) => !/[\r\n]/.test(value)),
      content: z.unknown(),
      saveContacts: z.boolean().optional(),
      confirmOtherPic: z.boolean().optional(),
    })
    .parse(input);
  const recipients = parseRecipients({ to: parsed.to, cc: parsed.cc, bcc: "" });
  const database = getDatabase();
  if (!database) throw new Error("Database belum tersedia.");
  const [record] = await database
    .select({ transaction: businessTransactions, document: transactionDocuments })
    .from(transactionDocuments)
    .innerJoin(businessTransactions, eq(businessTransactions.id, transactionDocuments.transactionId))
    .where(
      and(eq(transactionDocuments.id, parsed.documentId), eq(transactionDocuments.transactionId, parsed.transactionId)),
    )
    .limit(1);
  if (!record?.document.checksum) throw new Error("Dokumen siap-kirim tidak ditemukan.");
  if (
    user.role === "sales" &&
    record.transaction.ownerId &&
    record.transaction.ownerId !== user.id &&
    !parsed.confirmOtherPic
  )
    throw new Error("Konfirmasi pengiriman untuk transaksi milik PIC lain terlebih dahulu.");
  const key =
    record.document.type === "quotation"
      ? "quotation"
      : record.document.type.startsWith("invoice")
        ? "invoice"
        : record.document.type === "delivery_note"
          ? "delivery"
          : record.document.type === "bast"
            ? "handover"
            : null;
  if (!key) throw new Error("Jenis dokumen ini tidak dapat dikirim.");
  const template = await getActiveTemplate(key, parsed.language, parsed.templateId);
  if (template.templateId !== parsed.templateId) throw new Error("Template yang dipilih tidak tersedia.");
  const draft = await createDraft(
    {
      to: recipients.to.join(", "),
      cc: recipients.cc.join(", "),
      bcc: "",
      subject: parsed.subject,
      content: parsed.content as EmailNode,
      originalSubject: "",
      documentSource: {
        transactionId: parsed.transactionId,
        documentId: parsed.documentId,
        version: record.document.version,
        checksum: record.document.checksum,
      },
      templateSnapshot: {
        id: template.templateId,
        name: template.templateName,
        key,
        language: template.language,
        version: template.version,
      },
    },
    template.version,
  );
  if (parsed.saveContacts) {
    for (const email of recipients.to) {
      const [exists] = await database
        .select({ id: customerContacts.id })
        .from(customerContacts)
        .where(and(eq(customerContacts.customerId, record.transaction.customerId), eq(customerContacts.email, email)))
        .limit(1);
      if (!exists)
        await database
          .insert(customerContacts)
          .values({ customerId: record.transaction.customerId, name: email.split("@")[0].slice(0, 120), email });
    }
  }
  return draft;
}

export async function startEmailDraft(form: FormData) {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role)) throw new Error("Akses ditolak.");
  const replyId = String(form.get("replyToId") ?? "");
  const source = replyId ? await getEmailRecord(replyId) : null;
  if (replyId && (!source || source.folder !== "inbox")) throw new Error("Email asal tidak tersedia.");
  const settings = await getMailboxSettings();
  const template = await getActiveTemplate(source ? "reply" : "new");
  const variables = { senderName: user.name, originalSubject: source?.subject ?? "" };
  const recipients = source
    ? replyRecipients(
        source.fromAddress ?? "",
        source.replyToAddress,
        source.toAddress,
        source.ccAddress,
        settings?.email ?? "",
        form.get("all") === "1",
      )
    : { to: "", cc: "", bcc: "" };
  const draft = await createDraft(
    {
      ...recipients,
      subject: fillEmailSubject(template.subject, variables),
      content: fillEmailTemplate(template.content, variables),
      replyToId: source?.id,
      originalSubject: source?.subject ?? "",
    },
    template.version,
  );
  revalidatePath("/admin/email");
  redirect(`/admin/email?folder=drafts&draft=${draft.id}`);
}
export async function saveEmailDraft(
  id: string,
  revision: number,
  input: Pick<DraftPayload, "to" | "cc" | "bcc" | "subject" | "content">,
) {
  try {
    return { ok: true as const, ...(await saveDraft(id, revision, input)) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Draf belum tersimpan. Coba lagi." };
  }
}
export async function copyEmailDraft(
  id: string,
  input: { to: string; cc: string; bcc: string; subject: string; content: EmailNode },
) {
  const draft = await copyDraft(id, input);
  return { id: draft.id, revision: draft.revision };
}
export async function prepareEmailDraft(id: string, revision: number, allowUnscanned = false) {
  try {
    return { ok: true as const, ...(await prepareDraft(id, revision, allowUnscanned)) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Pratinjau belum tersedia." };
  }
}
export async function confirmEmailDraft(attemptId: string) {
  try {
    const result = await sendPreparedDraft(attemptId);
    revalidatePath("/admin/email");
    revalidatePath("/admin/transactions", "layout");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Status pengiriman perlu diperiksa. Jangan kirim ulang.",
    };
  }
}

export async function removeEmailDraftFile(id: string, revision: number, fileId: string) {
  try {
    const draft = await removeDraftFile(id, revision, fileId);
    return { ok: true as const, revision: draft.revision, files: draft.files };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Lampiran belum dapat dihapus." };
  }
}

export async function startRejectedRecipientsDraft(form: FormData) {
  const draft = await retryRejectedRecipients(String(form.get("attemptId") ?? ""));
  redirect(`/admin/email?folder=drafts&draft=${draft.id}`);
}
