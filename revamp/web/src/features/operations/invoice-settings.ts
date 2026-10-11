import { getDatabase } from "@/lib/database/client";
import { invoiceIssuerSettings } from "@/lib/database/schema";

export async function getInvoiceIssuer() {
  const database = getDatabase();
  if (!database) return null;
  const [settings] = await database.select().from(invoiceIssuerSettings).limit(1);
  return settings ?? null;
}

export function invoiceIssuerIsReady(settings: Awaited<ReturnType<typeof getInvoiceIssuer>>) {
  return Boolean(
    settings?.approvedAt &&
    settings.legalName &&
    settings.address &&
    settings.phone &&
    settings.email &&
    settings.bankName &&
    settings.bankAccountNo &&
    settings.bankAccountName &&
    settings.signerName &&
    settings.signerTitle &&
    settings.logoPath,
  );
}
