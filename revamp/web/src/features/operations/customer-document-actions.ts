"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs, businessTransactions, customerAddresses, customerContacts, customers } from "@/lib/database/schema";
import type { CustomerAddressInput, TransactionCustomerSnapshot } from "./customer-profile";
import type { CustomerDocumentProfileInput, CustomerDocumentProfileState } from "./customer-document-profile";

const schema = z.object({
  transactionId: z.string().uuid(),
  legalName: z.string().trim().min(2, "Nama pelanggan perlu diisi.").max(180),
  email: z.union([z.literal(""), z.email("Alamat email belum valid.").max(255)]),
  phone: z.string().trim().max(32),
  taxId: z.string().trim().max(32),
  billingAddress: z.string().trim().max(1200),
  deliveryAddress: z.string().trim().max(1200),
  updateMaster: z.boolean(),
});

const fields = ["legalName", "email", "phone", "taxId", "billingAddress", "deliveryAddress"] as const;

export async function updateCustomerDocumentProfile(formData: FormData): Promise<CustomerDocumentProfileState> {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role)) {
    return { ok: false, message: "Anda tidak memiliki akses untuk mengubah data pelanggan." };
  }
  const parsed = schema.safeParse({
    ...Object.fromEntries(["transactionId", ...fields].map((name) => [name, String(formData.get(name) ?? "")])),
    updateMaster: formData.get("updateMaster") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: CustomerDocumentProfileState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof CustomerDocumentProfileInput;
      if (fields.includes(field) && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { ok: false, message: "Periksa data yang ditandai.", fieldErrors };
  }
  const database = getDatabase();
  if (!database) return { ok: false, message: "Database belum terhubung." };
  const { transactionId, updateMaster, ...profile } = parsed.data;
  try {
    const updatedProfile = await database.transaction(async (tx) => {
      const [target] = await tx
        .select({
          customerId: businessTransactions.customerId,
          customerSnapshot: businessTransactions.customerSnapshot,
          createdAt: businessTransactions.createdAt,
        })
        .from(businessTransactions)
        .where(eq(businessTransactions.id, transactionId))
        .limit(1);
      if (!target) throw new Error("Transaksi tidak ditemukan.");
      const previous =
        target.customerSnapshot && typeof target.customerSnapshot === "object"
          ? (target.customerSnapshot as TransactionCustomerSnapshot)
          : null;
      const contacts = previous?.contacts.length
        ? previous.contacts.map((contact, index) =>
            contact.isPrimary || index === 0
              ? { ...contact, email: profile.email, phone: profile.phone, isPrimary: true }
              : { ...contact, isPrimary: false },
          )
        : [
            {
              name: profile.legalName,
              position: "Kontak utama",
              email: profile.email,
              phone: profile.phone,
              isPrimary: true,
            },
          ];
      const freeAddress = (
        kind: "billing" | "delivery",
        addressLine: string,
        previousAddress?: CustomerAddressInput | null,
      ): CustomerAddressInput | null =>
        addressLine
          ? {
              ...(previousAddress ?? {}),
              kind,
              label: previousAddress?.label ?? (kind === "billing" ? "Alamat penagihan" : "Alamat pengiriman"),
              countryCode: previousAddress?.countryCode || "ZZ",
              countryName: previousAddress?.countryName || "Belum ditentukan",
              addressLine,
              provinceCode: previousAddress?.provinceCode ?? "",
              provinceName: previousAddress?.provinceName ?? "",
              regencyCode: previousAddress?.regencyCode ?? "",
              regencyName: previousAddress?.regencyName ?? "",
              districtCode: previousAddress?.districtCode ?? "",
              districtName: previousAddress?.districtName ?? "",
              villageCode: previousAddress?.villageCode ?? "",
              villageName: previousAddress?.villageName ?? "",
              postalCode: previousAddress?.postalCode ?? "",
              isDefault: true,
              isStructured: previousAddress?.isStructured ?? false,
            }
          : null;
      const billingAddress = freeAddress("billing", profile.billingAddress, previous?.billingAddress);
      const deliveryAddress = freeAddress(
        "delivery",
        profile.deliveryAddress,
        previous?.deliveryAddresses.find((address) => address.id === previous.selectedDeliveryAddressId) ??
          previous?.deliveryAddresses.find((address) => address.isDefault),
      );
      const snapshot: TransactionCustomerSnapshot = {
        version: 1,
        capturedAt: previous?.capturedAt ?? target.createdAt.toISOString(),
        customerId: target.customerId,
        name: profile.legalName,
        taxId: profile.taxId,
        contacts,
        billingAddress,
        deliveryAddresses: deliveryAddress ? [deliveryAddress] : [],
        selectedDeliveryAddressId: deliveryAddress?.id ?? null,
      };
      await tx
        .update(businessTransactions)
        .set({ customerSnapshot: snapshot, updatedAt: new Date() })
        .where(eq(businessTransactions.id, transactionId));
      if (updateMaster) {
        const [updated] = await tx
          .update(customers)
          .set({
            legalName: profile.legalName,
            displayName: profile.legalName,
            email: profile.email || null,
            phone: profile.phone || null,
            taxId: profile.taxId || null,
            ...(profile.billingAddress ? { billingAddress: profile.billingAddress } : {}),
            ...(profile.deliveryAddress ? { deliveryAddress: profile.deliveryAddress } : {}),
            updatedAt: new Date(),
          })
          .where(eq(customers.id, target.customerId))
          .returning({ id: customers.id });
        if (!updated) throw new Error("Pelanggan tidak ditemukan.");
        const [primaryContact] = await tx
          .select({ id: customerContacts.id })
          .from(customerContacts)
          .where(and(eq(customerContacts.customerId, target.customerId), eq(customerContacts.isPrimary, true)))
          .limit(1);
        if (primaryContact) {
          await tx
            .update(customerContacts)
            .set({ email: profile.email || null, phone: profile.phone || null, updatedAt: new Date() })
            .where(eq(customerContacts.id, primaryContact.id));
        } else if (profile.email || profile.phone) {
          await tx.insert(customerContacts).values({
            customerId: target.customerId,
            name: profile.legalName,
            email: profile.email || null,
            phone: profile.phone || null,
            isPrimary: true,
          });
        }
        const existingAddresses = await tx
          .select()
          .from(customerAddresses)
          .where(eq(customerAddresses.customerId, target.customerId));
        for (const address of [billingAddress, deliveryAddress].filter(Boolean) as CustomerAddressInput[]) {
          const existing =
            address.kind === "billing"
              ? existingAddresses.find((item) => item.kind === "billing")
              : existingAddresses.find((item) => item.kind === "delivery" && item.isDefault);
          if (existing) {
            await tx
              .update(customerAddresses)
              .set({ addressLine: address.addressLine, updatedAt: new Date() })
              .where(eq(customerAddresses.id, existing.id));
          } else {
            await tx.insert(customerAddresses).values({
              customerId: target.customerId,
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
              isDefault: true,
              isStructured: address.isStructured,
            });
          }
        }
      }
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "customer.document_profile_updated",
        entityType: "transaction",
        entityId: transactionId,
        metadata: { customerId: target.customerId, fields, updateMaster },
      });
      return profile;
    });
    revalidatePath(`/admin/transactions/${transactionId}`);
    return { ok: true, message: "Data pelanggan sudah diperbarui.", updatedProfile };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Data pelanggan belum dapat disimpan." };
  }
}
