"use server";

import { headers } from "next/headers";
import { getDatabase } from "@/lib/database/client";
import { leads } from "@/lib/database/schema";
import { leadFormSchema } from "./schema";

export type LeadFormState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Partial<Record<"name" | "phone" | "message", string>>;
  whatsappUrl?: string;
};

export async function submitLead(_previousState: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const parsed = leadFormSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    message: formData.get("message"),
    landingPath: formData.get("landingPath"),
    website: formData.get("website"),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Periksa kembali data yang Anda isi.",
      fieldErrors: {
        name: errors.name?.[0],
        phone: errors.phone?.[0],
        message: errors.message?.[0],
      },
    };
  }

  if (parsed.data.website) {
    return {
      status: "success",
      message: "Terima kasih. Kebutuhan Anda sudah kami terima.",
    };
  }

  const database = getDatabase();

  if (!database) {
    return {
      status: "error",
      message: "Form belum terhubung ke penyimpanan. Silakan hubungi kami melalui WhatsApp.",
    };
  }

  try {
    const requestHeaders = await headers();

    await database.insert(leads).values({
      name: parsed.data.name,
      phone: parsed.data.phone,
      message: parsed.data.message,
      landingPath: parsed.data.landingPath || null,
      referrer: requestHeaders.get("referer"),
    });

    const whatsappMessage = [
      "Halo Anugrah Plastik, saya baru mengirim permintaan dari website.",
      `Nama: ${parsed.data.name}`,
      `Kontak: ${parsed.data.phone}`,
      `Kebutuhan: ${parsed.data.message}`,
    ].join("\n");

    return {
      status: "success",
      message: "Data tersimpan. WhatsApp akan dibuka untuk melanjutkan percakapan.",
      whatsappUrl: `https://wa.me/628122339587?text=${encodeURIComponent(whatsappMessage)}`,
    };
  } catch (error) {
    console.error("Lead submission failed", error);

    return {
      status: "error",
      message: "Permintaan belum terkirim. Silakan coba lagi atau hubungi kami melalui WhatsApp.",
    };
  }
}
