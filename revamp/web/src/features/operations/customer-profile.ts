export type CustomerAddressKind = "billing" | "delivery";

export type CustomerAddressInput = {
  id?: string;
  kind: CustomerAddressKind;
  label: string;
  countryCode: string;
  countryName: string;
  addressLine: string;
  provinceCode: string;
  provinceName: string;
  regencyCode: string;
  regencyName: string;
  districtCode: string;
  districtName: string;
  villageCode: string;
  villageName: string;
  postalCode: string;
  isDefault: boolean;
  isStructured: boolean;
};

export type CustomerContactInput = {
  id?: string;
  name: string;
  position: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};

export type CustomerProfileInput = {
  id?: string;
  code?: string;
  name: string;
  taxId: string;
  status: "active" | "inactive";
  contacts: CustomerContactInput[];
  billingAddress: CustomerAddressInput | null;
  deliveryAddresses: CustomerAddressInput[];
  legacyBillingAddress?: string;
  legacyDeliveryAddress?: string;
};

export type TransactionCustomerSnapshot = {
  version: 1;
  capturedAt: string;
  customerId: string;
  name: string;
  taxId: string;
  contacts: CustomerContactInput[];
  billingAddress: CustomerAddressInput | null;
  deliveryAddresses: CustomerAddressInput[];
  selectedDeliveryAddressId: string | null;
};

export type CustomerProfileActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  profile?: CustomerProfileInput;
};

export function formatCustomerAddress(address: CustomerAddressInput | null | undefined) {
  if (!address) return "";
  if (address.countryCode !== "ID") return [address.addressLine, address.countryName].filter(Boolean).join(", ");
  return [
    address.addressLine,
    address.villageName,
    address.districtName,
    address.regencyName,
    address.provinceName,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

export function customerProfileComplete(profile: CustomerProfileInput) {
  const primary = profile.contacts.find((contact) => contact.isPrimary);
  return Boolean(
    profile.name.trim() &&
    primary?.name.trim() &&
    (primary.email.trim() || primary.phone.trim()) &&
    formatCustomerAddress(profile.billingAddress).trim() &&
    (profile.billingAddress?.countryCode !== "ID" || profile.billingAddress.isStructured),
  );
}
