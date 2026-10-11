import { z } from "zod";
import { readShipmentLogistics, type ShipmentLogistics } from "./delivery-note";
import { quantityMillis } from "./invoice-math";

const quantity = z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/);

export const handoverDetailsSchema = z.object({
  recipient: z.string().trim().min(2).max(160),
  location: z.string().trim().min(5).max(1000),
  condition: z.enum(["good", "partial", "damaged"]),
  note: z.string().trim().max(1500),
  senderName: z.string().trim().max(120),
  driverName: z.string().trim().max(120),
  receiverName: z.string().trim().max(120),
  items: z
    .array(z.object({ lineId: z.string().uuid(), accepted: quantity }))
    .min(1)
    .max(30),
});

export type HandoverDetails = z.infer<typeof handoverDetailsSchema>;

export function handoverDetailsEqual(left: HandoverDetails, right: HandoverDetails) {
  const fields = ["recipient", "location", "condition", "note", "senderName", "driverName", "receiverName"] as const;
  return (
    fields.every((field) => left[field] === right[field]) &&
    left.items.length === right.items.length &&
    left.items.every((item) =>
      right.items.some((other) => other.lineId === item.lineId && other.accepted === item.accepted),
    )
  );
}

const months = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function formatHandoverNumber(value: number, date: Date) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 999999) throw new Error("Nomor STB tidak valid.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const year = parts.find((part) => part.type === "year")?.value;
  return `STB/AMB/${String(value).padStart(3, "0")}/${months[month - 1]}/${year}`;
}

export function acceptedAmount(status: string, shipped: string, accepted: string | null) {
  if (status !== "received" && status !== "received_partial") return 0;
  // Old signed receipts did not store per-line quantities; they mean fully received.
  return Number(accepted ?? (status === "received" ? shipped : "0"));
}

export function committedAmount(status: string, shipped: string, accepted: string | null) {
  return status === "received" || status === "received_partial"
    ? acceptedAmount(status, shipped, accepted)
    : Number(shipped);
}

export function validateHandoverDetails(details: HandoverDetails, lines: { lineId: string; quantity: string }[]) {
  if (
    new Set(details.items.map((item) => item.lineId)).size !== details.items.length ||
    details.items.length !== lines.length
  )
    throw new Error("Daftar barang STB tidak sesuai surat jalan.");
  let shortage = false;
  for (const line of lines) {
    const item = details.items.find((entry) => entry.lineId === line.lineId);
    if (!item || quantityMillis(item.accepted) > quantityMillis(line.quantity))
      throw new Error("Jumlah diterima tidak boleh melebihi jumlah pada surat jalan.");
    if (quantityMillis(item.accepted) < quantityMillis(line.quantity)) shortage = true;
  }
  if ((shortage || details.condition !== "good") && details.note.length < 8)
    throw new Error("Jelaskan selisih atau kerusakan minimal 8 karakter.");
  if (shortage && details.condition === "good")
    throw new Error("Pilih kondisi penerimaan sebagian saat ada selisih barang.");
  if (!shortage && details.condition === "partial")
    throw new Error("Kondisi diterima sebagian memerlukan jumlah diterima yang lebih kecil dari jumlah dikirim.");
  return { shortage };
}

function html(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

const fmt = (value: string) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(value));

export function handoverRenderData(input: {
  number: string;
  version: number;
  issuedAt: Date;
  customerName: string;
  shipmentNo: string;
  deliveryNo: string;
  poNo: string;
  deliveryOrderNo: string;
  vehiclePlate: string;
  details: HandoverDetails;
  lines: { lineId: string; description: string; unit: string; quantity: string; logistics: ShipmentLogistics }[];
  issuer: { legalName: string; address: string; phone: string; email: string; website: string; logoDataUri: string };
}) {
  return {
    nomor_stb: input.number,
    versi: input.version > 1 ? `Revisi ${input.version}` : "Penerbitan pertama",
    tanggal: new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long" }).format(input.issuedAt),
    nama_pelanggan: input.customerName,
    penerima: input.details.recipient,
    lokasi: input.details.location,
    kondisi:
      input.details.condition === "good"
        ? "Sesuai"
        : input.details.condition === "partial"
          ? "Sebagian"
          : "Ada kerusakan",
    catatan: input.details.note,
    nomor_pengiriman: input.shipmentNo,
    nomor_surat_jalan: input.deliveryNo,
    nomor_po: input.poNo,
    nomor_do: input.deliveryOrderNo,
    referensi_po_do: [input.poNo, input.deliveryOrderNo].filter(Boolean).join(" / "),
    nomor_polisi: input.vehiclePlate,
    nama_penyerah: input.details.senderName,
    nama_supir: input.details.driverName,
    nama_penerima_ttd: input.details.receiverName,
    penerbit: input.issuer.legalName,
    alamat_penerbit: input.issuer.address,
    telepon_penerbit: input.issuer.phone,
    email_penerbit: input.issuer.email,
    situs_penerbit: input.issuer.website,
    logo: input.issuer.logoDataUri,
    baris_barang: input.lines
      .map((line, index) => {
        const logistics = readShipmentLogistics(line.logistics);
        const accepted = input.details.items.find((item) => item.lineId === line.lineId)?.accepted ?? "0";
        const pack = logistics.packCount ? fmt(logistics.packCount) : "";
        const packText = logistics.piecesPerPack
          ? `${pack ? `${pack} × ` : ""}${fmt(logistics.piecesPerPack)} pcs/pack`
          : pack;
        return `<tr><td>${index + 1}</td><td>${html(line.description)}</td><td>${logistics.karungCount ? fmt(logistics.karungCount) : ""}</td><td>${packText}</td><td>${fmt(line.quantity)} ${html(line.unit)}</td><td>${fmt(accepted)} ${html(line.unit)}</td><td>${logistics.netKg ? fmt(logistics.netKg) : ""}</td><td>${html(logistics.remark)}</td></tr>`;
      })
      .join(""),
    // Backward-compatible fields for the existing dummy template.
    nomor_dokumen: input.number,
    pekerjaan: input.lines.map((line) => line.description).join(", "),
  };
}
