import { asc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { customerAddresses, customerContacts, customers, indonesiaRegions } from "@/lib/database/schema";
import type {
  CustomerAddressInput,
  CustomerContactInput,
  CustomerProfileInput,
  TransactionCustomerSnapshot,
} from "./customer-profile";

function addressFromRow(row: typeof customerAddresses.$inferSelect): CustomerAddressInput {
  return {
    id: row.id,
    kind: row.kind === "billing" ? "billing" : "delivery",
    label: row.label,
    countryCode: row.countryCode,
    countryName: row.countryName,
    addressLine: row.addressLine,
    provinceCode: row.provinceCode ?? "",
    provinceName: row.provinceName ?? "",
    regencyCode: row.regencyCode ?? "",
    regencyName: row.regencyName ?? "",
    districtCode: row.districtCode ?? "",
    districtName: row.districtName ?? "",
    villageCode: row.villageCode ?? "",
    villageName: row.villageName ?? "",
    postalCode: row.postalCode ?? "",
    isDefault: row.isDefault,
    isStructured: row.isStructured,
  };
}

function contactFromRow(row: typeof customerContacts.$inferSelect): CustomerContactInput {
  return {
    id: row.id,
    name: row.name,
    position: row.position ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    isPrimary: row.isPrimary,
  };
}

export async function getCustomerProfiles(ids: string[]) {
  const database = getDatabase();
  if (!database || !ids.length) return new Map<string, CustomerProfileInput>();
  const [customerRows, contactRows, addressRows] = await Promise.all([
    database.select().from(customers).where(inArray(customers.id, ids)),
    database
      .select()
      .from(customerContacts)
      .where(inArray(customerContacts.customerId, ids))
      .orderBy(customerContacts.customerId, asc(customerContacts.name)),
    database
      .select()
      .from(customerAddresses)
      .where(inArray(customerAddresses.customerId, ids))
      .orderBy(customerAddresses.customerId, asc(customerAddresses.kind), asc(customerAddresses.createdAt)),
  ]);
  return new Map(
    customerRows.map((customer) => {
      const contacts = contactRows.filter((row) => row.customerId === customer.id).map(contactFromRow);
      if (!contacts.length && (customer.email || customer.phone)) {
        contacts.push({
          name: customer.displayName,
          position: "Kontak utama",
          email: customer.email ?? "",
          phone: customer.phone ?? "",
          isPrimary: true,
        });
      }
      const addresses = addressRows.filter((row) => row.customerId === customer.id).map(addressFromRow);
      const billingAddress =
        addresses.find((address) => address.kind === "billing") ??
        (customer.billingAddress
          ? {
              kind: "billing" as const,
              label: "Alamat penagihan lama",
              countryCode: "ID",
              countryName: "Indonesia",
              addressLine: customer.billingAddress,
              provinceCode: "",
              provinceName: "",
              regencyCode: "",
              regencyName: "",
              districtCode: "",
              districtName: "",
              villageCode: "",
              villageName: "",
              postalCode: "",
              isDefault: true,
              isStructured: false,
            }
          : null);
      const deliveryAddresses = addresses.filter((address) => address.kind === "delivery");
      if (!deliveryAddresses.length && customer.deliveryAddress) {
        deliveryAddresses.push({
          kind: "delivery",
          label: "Alamat pengiriman lama",
          countryCode: "ID",
          countryName: "Indonesia",
          addressLine: customer.deliveryAddress,
          provinceCode: "",
          provinceName: "",
          regencyCode: "",
          regencyName: "",
          districtCode: "",
          districtName: "",
          villageCode: "",
          villageName: "",
          postalCode: "",
          isDefault: true,
          isStructured: false,
        });
      }
      return [
        customer.id,
        {
          id: customer.id,
          code: customer.code,
          name: customer.displayName,
          taxId: customer.taxId ?? "",
          status: customer.status === "inactive" ? "inactive" : "active",
          contacts,
          billingAddress,
          deliveryAddresses,
          legacyBillingAddress: customer.billingAddress ?? "",
          legacyDeliveryAddress: customer.deliveryAddress ?? "",
        } satisfies CustomerProfileInput,
      ] as const;
    }),
  );
}

export async function getCustomerProfile(id: string) {
  return (await getCustomerProfiles([id])).get(id) ?? null;
}

export function snapshotCustomerProfile(
  customerId: string,
  profile: CustomerProfileInput,
): TransactionCustomerSnapshot {
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    customerId,
    name: profile.name,
    taxId: profile.taxId,
    contacts: profile.contacts,
    billingAddress: profile.billingAddress,
    deliveryAddresses: profile.deliveryAddresses,
    selectedDeliveryAddressId:
      profile.deliveryAddresses.find((address) => address.isDefault)?.id ?? profile.deliveryAddresses[0]?.id ?? null,
  };
}

export async function validateIndonesiaAddress(address: CustomerAddressInput) {
  if (address.countryCode !== "ID") return true;
  const database = getDatabase();
  if (!database) return false;
  const codes = [address.provinceCode, address.regencyCode, address.districtCode, address.villageCode];
  if (codes.some((code) => !code)) return false;
  const rows = await database.select().from(indonesiaRegions).where(inArray(indonesiaRegions.code, codes));
  const byCode = new Map(rows.map((row) => [row.code, row]));
  return (
    byCode.get(address.provinceCode)?.level === "province" &&
    byCode.get(address.regencyCode)?.parentCode === address.provinceCode &&
    byCode.get(address.districtCode)?.parentCode === address.regencyCode &&
    byCode.get(address.villageCode)?.parentCode === address.districtCode
  );
}

export async function normalizeIndonesiaAddress(address: CustomerAddressInput) {
  if (address.countryCode !== "ID") return { ...address, isStructured: false };
  const database = getDatabase();
  if (!database) return null;
  const codes = [address.provinceCode, address.regencyCode, address.districtCode, address.villageCode];
  if (codes.some((code) => !code)) return null;
  const rows = await database.select().from(indonesiaRegions).where(inArray(indonesiaRegions.code, codes));
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const province = byCode.get(address.provinceCode);
  const regency = byCode.get(address.regencyCode);
  const district = byCode.get(address.districtCode);
  const village = byCode.get(address.villageCode);
  if (
    province?.level !== "province" ||
    regency?.parentCode !== province.code ||
    district?.parentCode !== regency.code ||
    village?.parentCode !== district.code
  )
    return null;
  return {
    ...address,
    countryCode: "ID",
    countryName: "Indonesia",
    provinceName: province.name,
    regencyName: regency.name,
    districtName: district.name,
    villageName: village.name,
    postalCode: village.postalCode ?? address.postalCode,
    isStructured: true,
  };
}

export async function regionOptions(input: { level: string; parentCode?: string; query?: string }) {
  const database = getDatabase();
  if (!database) return [];
  const rows = input.parentCode
    ? await database
        .select()
        .from(indonesiaRegions)
        .where(eq(indonesiaRegions.parentCode, input.parentCode))
        .orderBy(indonesiaRegions.name)
        .limit(500)
    : await database
        .select()
        .from(indonesiaRegions)
        .where(eq(indonesiaRegions.level, input.level))
        .orderBy(indonesiaRegions.name)
        .limit(500);
  const term = input.query?.trim().toLocaleLowerCase("id-ID") ?? "";
  return rows
    .filter((row) => row.level === input.level && (!term || row.name.toLocaleLowerCase("id-ID").includes(term)))
    .slice(0, 100)
    .map((row) => ({ code: row.code, name: row.name, postalCode: row.postalCode }));
}
