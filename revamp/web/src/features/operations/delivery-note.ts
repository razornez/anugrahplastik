import { z } from "zod";

const optionalCount = z.string().regex(/^$|^[1-9]\d{0,6}$/, "Isi bilangan bulat positif atau kosong.");
const optionalWeight = z.string().regex(/^$|^\d{1,9}(?:\.\d{1,3})?$/, "Isi kg dengan maksimal 3 desimal.");

export const shipmentLogisticsSchema = z.object({
  karungCount: optionalCount,
  packCount: optionalCount,
  piecesPerPack: optionalCount,
  grossKg: optionalWeight,
  netKg: optionalWeight,
  remark: z.string().trim().max(300),
});

export const deliveryDetailsSchema = z.object({
  recipientContactId: z.string().max(80).optional().default(""),
  deliveryAddressId: z.string().max(80).optional().default(""),
  deliveryOrderNo: z.string().trim().max(80),
  senderName: z.string().trim().max(120),
  driverName: z.string().trim().max(120),
  receiverSignatureName: z.string().trim().max(120),
  vehiclePlate: z.string().trim().max(32),
  note: z.string().trim().max(1500),
});

export type ShipmentLogistics = z.infer<typeof shipmentLogisticsSchema>;
export type DeliveryDetails = z.infer<typeof deliveryDetailsSchema>;

export const emptyLogistics: ShipmentLogistics = {
  karungCount: "",
  packCount: "",
  piecesPerPack: "",
  grossKg: "",
  netKg: "",
  remark: "",
};

export const emptyDeliveryDetails: DeliveryDetails = {
  recipientContactId: "",
  deliveryAddressId: "",
  deliveryOrderNo: "",
  senderName: "",
  driverName: "",
  receiverSignatureName: "",
  vehiclePlate: "",
  note: "",
};

export function readShipmentLogistics(value: unknown): ShipmentLogistics {
  const parsed = shipmentLogisticsSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyLogistics;
}

export function readDeliveryDetails(value: unknown): DeliveryDetails {
  const parsed = deliveryDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyDeliveryDetails;
}

export function validateShipmentLogistics(logistics: ShipmentLogistics, quantity: string, unit: string) {
  if (logistics.grossKg && logistics.netKg && Number(logistics.grossKg) < Number(logistics.netKg)) {
    throw new Error("Berat bruto tidak boleh lebih kecil dari berat neto.");
  }
  if (unit.toLowerCase() === "pcs" && logistics.packCount && logistics.piecesPerPack) {
    if (Number(logistics.packCount) * Number(logistics.piecesPerPack) !== Number(quantity)) {
      throw new Error("Jumlah pack × isi per pack harus sama dengan jumlah pcs yang dikirim.");
    }
  }
}

export function shipmentPackError(logistics: ShipmentLogistics, quantity: string, unit: string) {
  if (unit.toLowerCase() !== "pcs" || !logistics.packCount || !logistics.piecesPerPack || !quantity) return null;
  const packed = Number(logistics.packCount) * Number(logistics.piecesPerPack);
  const shipped = Number(quantity);
  if (packed === shipped) return null;
  return `${logistics.packCount} pack × ${logistics.piecesPerPack} pcs = ${new Intl.NumberFormat("id-ID").format(packed)} pcs, sedangkan jumlah dikirim ${new Intl.NumberFormat("id-ID").format(shipped)} pcs. Sesuaikan jumlah, pack, atau isi per pack.`;
}

const months = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function formatDeliveryNumber(value: number, date: Date) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 999999) throw new Error("Nomor surat jalan tidak valid.");
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", month: "numeric" }).format(date));
  const year = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric" }).format(date);
  return `SJ/AMB/${String(value).padStart(3, "0")}/${months[month - 1]}/${year}`;
}

function html(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
}

const count = (value: string) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(value));

export function deliveryRenderData(input: {
  number: string;
  version: number;
  issuedAt: Date;
  plannedShipAt?: Date | null;
  customerName: string;
  recipientName: string;
  address: string;
  poNo: string;
  details: DeliveryDetails;
  lines: { description: string; quantity: string; unit: string; logistics: ShipmentLogistics }[];
  issuer: { legalName: string; address: string; phone: string; email: string; website: string; logoDataUri: string };
}) {
  return {
    nomor_surat_jalan: input.number,
    versi: input.version > 1 ? `Revisi ${input.version}` : "Penerbitan pertama",
    tanggal: new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long" }).format(input.issuedAt),
    jadwal_pengiriman: input.plannedShipAt
      ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short" }).format(
          input.plannedShipAt,
        ) + " WIB"
      : "Belum dijadwalkan",
    nama_pelanggan: input.customerName,
    penerima: input.recipientName,
    alamat: input.address,
    nomor_po: input.poNo,
    nomor_do: input.details.deliveryOrderNo,
    nama_pengirim: input.details.senderName,
    nama_supir: input.details.driverName,
    nama_penerima_ttd: input.details.receiverSignatureName,
    nomor_polisi: input.details.vehiclePlate,
    catatan: input.details.note,
    penerbit: input.issuer.legalName,
    alamat_penerbit: input.issuer.address,
    telepon_penerbit: input.issuer.phone,
    email_penerbit: input.issuer.email,
    situs_penerbit: input.issuer.website,
    logo: input.issuer.logoDataUri,
    baris_barang: input.lines
      .map((item, index) => {
        const pack = item.logistics.packCount ? count(item.logistics.packCount) : "";
        const packDetail = item.logistics.piecesPerPack
          ? `${pack ? `${pack} × ` : ""}${count(item.logistics.piecesPerPack)} pcs/pack`
          : pack;
        return `<tr><td>${index + 1}</td><td>${html(item.description)}</td><td>${item.logistics.karungCount ? count(item.logistics.karungCount) : ""}</td><td>${packDetail}</td><td>${count(item.quantity)} ${html(item.unit)}</td><td>${item.logistics.grossKg ? count(item.logistics.grossKg) : ""}</td><td>${item.logistics.netKg ? count(item.logistics.netKg) : ""}</td><td>${html(item.logistics.remark)}</td></tr>`;
      })
      .join(""),
    // Compatibility fields for existing dummy templates until the new version is published.
    pekerjaan: input.lines.map((item) => item.description).join(", "),
    barang: input.lines
      .map((item, index) => `${index + 1}. ${item.description} - ${count(item.quantity)} ${item.unit}`)
      .join("\n"),
  };
}
