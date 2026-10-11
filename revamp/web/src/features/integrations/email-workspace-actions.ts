"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
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
import { replyRecipients } from "./email-workspace-model";

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
export async function prepareEmailDraft(id: string, revision: number) {
  try {
    return { ok: true as const, ...(await prepareDraft(id, revision)) };
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
