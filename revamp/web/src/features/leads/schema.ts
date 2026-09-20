import { z } from "zod";

const phonePattern = /^[+0-9][0-9 -]{7,22}$/;

export const leadFormSchema = z.object({
  name: z.string().trim().min(2, "Mohon isi nama Anda.").max(120, "Nama terlalu panjang."),
  phone: z.string().trim().regex(phonePattern, "Masukkan nomor WhatsApp yang valid."),
  message: z
    .string()
    .trim()
    .min(10, "Ceritakan kebutuhan Anda sedikit lebih lengkap.")
    .max(2000, "Pesan terlalu panjang."),
  landingPath: z.string().max(500).optional(),
  website: z.string().max(0).optional(),
});

export type LeadFormValues = z.infer<typeof leadFormSchema>;
