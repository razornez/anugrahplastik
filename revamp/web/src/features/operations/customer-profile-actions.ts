"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, customerAddresses, customerContacts, customers, masterNumberCounters } from "@/lib/database/schema";
import {
  customerProfileComplete,
  formatCustomerAddress,
  type CustomerAddressInput,
  type CustomerProfileActionState,
  type CustomerProfileInput,
} from "./customer-profile";
import { getCustomerProfile, normalizeIndonesiaAddress } from "./customer-profile-service";

const contactSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(120),
  position: z.string().trim().max(100),
  email: z.union([z.literal(""), z.email("Email PIC belum valid.").max(255)]),
  phone: z.string().trim().max(32),
  isPrimary: z.boolean(),
});

const addressSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["billing", "delivery"]),
  label: z.string().trim().max(100),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, "Pilih negara."),
  countryName: z.string().trim().min(2).max(120),
  addressLine: z.string().trim().max(1200),
  provinceCode: z.string().trim().max(20),
  provinceName: z.string().trim().max(180),
  regencyCode: z.string().trim().max(20),
  regencyName: z.string().trim().max(180),
  districtCode: z.string().trim().max(20),
  districtName: z.string().trim().max(180),
  villageCode: z.string().trim().max(20),
  villageName: z.string().trim().max(180),
  postalCode: z.string().trim().max(12),
  isDefault: z.boolean(),
  isStructured: z.boolean(),
});

const profileSchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z.string().max(32).optional(),
    name: z.string().trim().min(2, "Nama pelanggan wajib diisi.").max(180),
    taxId: z.string().trim().max(32),
    status: z.enum(["active", "inactive"]),
    contacts: z.array(contactSchema).max(10),
    billingAddress: addressSchema.nullable(),
    deliveryAddresses: z.array(addressSchema).max(10),
  })
  .superRefine((profile, context) => {
    const primaryCount = profile.contacts.filter((contact) => contact.isPrimary).length;
    if (primaryCount > 1 || (!profile.id && primaryCount !== 1))
      context.addIssue({ code: "custom", path: ["contacts"], message: "Pilih tepat satu PIC utama." });
    if (profile.billingAddress && profile.billingAddress.kind !== "billing")
      context.addIssue({ code: "custom", path: ["billingAddress"], message: "Alamat penagihan belum valid." });
    if (profile.deliveryAddresses.some((address) => address.kind !== "delivery"))
      context.addIssue({ code: "custom", path: ["deliveryAddresses"], message: "Alamat pengiriman belum valid." });
    if (profile.deliveryAddresses.filter((address) => address.isDefault).length > 1)
      context.addIssue({ code: "custom", path: ["deliveryAddresses"], message: "Pilih satu alamat pengiriman utama." });
    const newCustomer = !profile.id;
    if (newCustomer && !profile.contacts.length)
      context.addIssue({ code: "custom", path: ["contacts"], message: "Tambahkan minimal satu PIC." });
    profile.contacts.forEach((contact, index) => {
      if (newCustomer && contact.name.length < 2)
        context.addIssue({ code: "custom", path: ["contacts", index, "name"], message: "Nama PIC wajib diisi." });
      if (newCustomer && !contact.email && !contact.phone)
        context.addIssue({
          code: "custom",
          path: ["contacts", index, "email"],
          message: "Isi email atau telepon PIC.",
        });
    });
    if (newCustomer && !profile.billingAddress)
      context.addIssue({ code: "custom", path: ["billingAddress"], message: "Tambahkan alamat penagihan." });
    if (profile.billingAddress && newCustomer) {
      if (profile.billingAddress.label.length < 2)
        context.addIssue({ code: "custom", path: ["billingAddress", "label"], message: "Nama lokasi wajib diisi." });
      if (profile.billingAddress.addressLine.length < 5)
        context.addIssue({
          code: "custom",
          path: ["billingAddress", "addressLine"],
          message: "Alamat jalan wajib diisi.",
        });
      if (profile.billingAddress.countryCode === "ID") {
        for (const field of ["provinceCode", "regencyCode", "districtCode", "villageCode"] as const) {
          if (!profile.billingAddress[field])
            context.addIssue({ code: "custom", path: ["billingAddress", field], message: "Pilih wilayah ini." });
        }
      }
    }
    profile.deliveryAddresses.forEach((address, index) => {
      if (newCustomer && address.label.length < 2)
        context.addIssue({
          code: "custom",
          path: ["deliveryAddresses", index, "label"],
          message: "Nama lokasi wajib diisi.",
        });
      if (newCustomer && address.addressLine.length < 5)
        context.addIssue({
          code: "custom",
          path: ["deliveryAddresses", index, "addressLine"],
          message: "Alamat jalan wajib diisi.",
        });
      if (newCustomer && address.countryCode === "ID") {
        for (const field of ["provinceCode", "regencyCode", "districtCode", "villageCode"] as const) {
          if (!address[field])
            context.addIssue({
              code: "custom",
              path: ["deliveryAddresses", index, field],
              message: "Pilih wilayah ini.",
            });
        }
      }
    });
  });

function issueMap(error: z.ZodError) {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

async function normalizeAddress(address: CustomerAddressInput) {
  if (address.countryCode !== "ID") {
    return {
      ...address,
      provinceCode: "",
      provinceName: "",
      regencyCode: "",
      regencyName: "",
      districtCode: "",
      districtName: "",
      villageCode: "",
      villageName: "",
      postalCode: address.postalCode,
      isStructured: false,
    };
  }
  if (
    !address.isStructured &&
    !address.provinceCode &&
    !address.regencyCode &&
    !address.districtCode &&
    !address.villageCode
  )
    return address;
  return normalizeIndonesiaAddress(address);
}

export async function saveCustomerProfile(formData: FormData): Promise<CustomerProfileActionState> {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role))
    return { ok: false, message: "Anda tidak memiliki akses untuk mengubah pelanggan." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("profile") ?? ""));
  } catch {
    return { ok: false, message: "Data pelanggan tidak dapat dibaca." };
  }
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, message: "Periksa data yang ditandai.", fieldErrors: issueMap(parsed.error) };
  const billingAddress = parsed.data.billingAddress
    ? await normalizeAddress(parsed.data.billingAddress as CustomerAddressInput)
    : null;
  const deliveryAddresses = await Promise.all(
    parsed.data.deliveryAddresses.map((address) => normalizeAddress(address as CustomerAddressInput)),
  );
  if ((parsed.data.billingAddress && !billingAddress) || deliveryAddresses.some((address) => !address)) {
    return {
      ok: false,
      message: "Wilayah Indonesia tidak cocok dengan katalog lokal.",
      fieldErrors: { billingAddress: "Pilih ulang wilayah secara berurutan." },
    };
  }
  const normalizedDelivery = deliveryAddresses.filter(Boolean) as CustomerAddressInput[];
  if (normalizedDelivery.length && !normalizedDelivery.some((address) => address.isDefault)) {
    normalizedDelivery[0] = { ...normalizedDelivery[0], isDefault: true };
  }
  const profile: CustomerProfileInput = {
    ...parsed.data,
    billingAddress,
    deliveryAddresses: normalizedDelivery,
  };
  if (!profile.id && !customerProfileComplete(profile))
    return { ok: false, message: "Lengkapi PIC utama dan alamat penagihan sebelum membuat pelanggan baru." };
  const database = getDatabase();
  if (!database) return { ok: false, message: "Database belum terhubung." };
  try {
    const customerId = await database.transaction(async (tx) => {
      let id = profile.id;
      let code = profile.code;
      if (!id) {
        const [counter] = await tx
          .insert(masterNumberCounters)
          .values({ kind: "customer", lastValue: 1 })
          .onConflictDoUpdate({
            target: masterNumberCounters.kind,
            set: { lastValue: sql`${masterNumberCounters.lastValue} + 1`, updatedAt: new Date() },
          })
          .returning({ lastValue: masterNumberCounters.lastValue });
        code = `CUS-${String(counter?.lastValue ?? 1).padStart(6, "0")}`;
        const [created] = await tx
          .insert(customers)
          .values({
            code,
            legalName: profile.name,
            displayName: profile.name,
            taxId: profile.taxId || null,
            email: profile.contacts.find((contact) => contact.isPrimary)?.email || null,
            phone: profile.contacts.find((contact) => contact.isPrimary)?.phone || null,
            billingAddress: formatCustomerAddress(profile.billingAddress),
            deliveryAddress: formatCustomerAddress(profile.deliveryAddresses.find((address) => address.isDefault)),
            status: profile.status,
          })
          .returning({ id: customers.id });
        if (!created) throw new Error("Pelanggan belum dapat dibuat.");
        id = created.id;
      } else {
        const primary = profile.contacts.find((contact) => contact.isPrimary);
        const [updated] = await tx
          .update(customers)
          .set({
            legalName: profile.name,
            displayName: profile.name,
            taxId: profile.taxId || null,
            email: primary?.email || null,
            phone: primary?.phone || null,
            billingAddress: formatCustomerAddress(profile.billingAddress),
            deliveryAddress: formatCustomerAddress(profile.deliveryAddresses.find((address) => address.isDefault)),
            status: profile.status,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, id))
          .returning({ id: customers.id });
        if (!updated) throw new Error("Pelanggan tidak ditemukan.");
      }
      await tx.delete(customerContacts).where(eq(customerContacts.customerId, id));
      await tx.delete(customerAddresses).where(eq(customerAddresses.customerId, id));
      if (profile.contacts.length)
        await tx.insert(customerContacts).values(
          profile.contacts.map((contact) => ({
            customerId: id!,
            name: contact.name,
            position: contact.position || null,
            email: contact.email || null,
            phone: contact.phone || null,
            isPrimary: contact.isPrimary,
          })),
        );
      const addresses = [profile.billingAddress, ...profile.deliveryAddresses].filter(
        Boolean,
      ) as CustomerAddressInput[];
      if (addresses.length)
        await tx.insert(customerAddresses).values(
          addresses.map((address) => ({
            customerId: id!,
            kind: address.kind,
            label: address.label,
            countryCode: address.countryCode,
            countryName: address.countryName,
            addressLine: address.addressLine,
            provinceCode: address.provinceCode || null,
            provinceName: address.provinceName || null,
            regencyCode: address.regencyCode || null,
            regencyName: address.regencyName || null,
            districtCode: address.districtCode || null,
            districtName: address.districtName || null,
            villageCode: address.villageCode || null,
            villageName: address.villageName || null,
            postalCode: address.postalCode || null,
            isDefault: address.kind === "billing" ? true : address.isDefault,
            isStructured: address.isStructured,
          })),
        );
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: profile.id ? "master.customer_profile_updated" : "master.customer_profile_created",
        entityType: "customer",
        entityId: id,
        metadata: {
          code,
          contacts: profile.contacts.length,
          deliveryAddresses: profile.deliveryAddresses.length,
          countryCode: profile.billingAddress?.countryCode,
        },
      });
      return id;
    });
    revalidatePath("/admin/masters/customers");
    revalidatePath("/admin/transactions");
    return {
      ok: true,
      message: profile.id
        ? customerProfileComplete(profile)
          ? "Data pelanggan diperbarui."
          : "Perubahan tersimpan. Profil masih belum lengkap."
        : "Pelanggan baru disimpan.",
      profile: (await getCustomerProfile(customerId)) ?? profile,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      ok: false,
      message: message === "Pelanggan tidak ditemukan." ? message : "Pelanggan belum dapat disimpan. Coba lagi.",
    };
  }
}
