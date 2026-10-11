import { calculateQuote, centsText, roundDivide, type QuoteLineInput } from "./quote-math";

export type InvoiceSourceLine = QuoteLineInput & { id: string; materialName?: string | null };
export type InvoiceQuantity = { lineId: string; quantity: string };

export const moneyCents = (value: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Nominal tidak valid.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0") || "0");
};
const money = moneyCents;

export const quantityMillis = (value: string) => {
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) throw new Error("Jumlah barang tidak valid.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0") || "0");
};
const quantity = quantityMillis;

const quantityText = (value: bigint) => `${value / BigInt(1000)}.${String(value % BigInt(1000)).padStart(3, "0")}`;

export function formatInvoiceNumber(sequence: number, year: number, month: number) {
  const months = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    !Number.isSafeInteger(year) ||
    year < 2000 ||
    !months[month - 1]
  ) {
    throw new Error("Urutan atau tanggal nomor invoice tidak valid.");
  }
  return `INV/AMB/${String(sequence).padStart(3, "0")}/${months[month - 1]}/${year}`;
}

export function calculateDpInvoice(lines: InvoiceSourceLine[], amount: string) {
  const quote = calculateQuote(lines);
  const total = money(quote.total);
  const billed = money(amount);
  if (billed <= BigInt(0) || billed > total)
    throw new Error("DP harus lebih dari nol dan tidak boleh melebihi nilai order.");
  const tax = roundDivide(money(quote.tax) * billed, total);
  const dpp = roundDivide(money(quote.dpp) * billed, total);
  return {
    kind: "dp" as const,
    referenceLines: quote.lines.map((line, index) => ({
      ...line,
      lineId: lines[index].id,
      materialName: lines[index].materialName ?? "",
    })),
    referenceGross: quote.gross,
    referenceDiscount: quote.discount,
    referenceTotal: quote.total,
    gross: amount,
    discount: "0.00",
    goodsSubtotal: centsText(billed - tax),
    goodsTax: centsText(tax),
    goodsTotal: centsText(billed),
    subtotal: centsText(billed - tax),
    dpp: centsText(dpp),
    tax: centsText(tax),
    dpApplied: "0.00",
    amountDue: centsText(billed),
  };
}

function atQuantity(line: InvoiceSourceLine, billedQuantity: bigint) {
  if (!billedQuantity)
    return {
      gross: BigInt(0),
      discount: BigInt(0),
      subtotal: BigInt(0),
      dpp: BigInt(0),
      tax: BigInt(0),
      total: BigInt(0),
    };
  const ordered = quantity(line.quantity);
  const fullDiscount = money(calculateQuote([line]).discount);
  const proratedDiscount = roundDivide(fullDiscount * billedQuantity, ordered);
  const calculated = calculateQuote([
    {
      ...line,
      quantity: quantityText(billedQuantity),
      discountKind: "amount",
      discountValue: centsText(proratedDiscount),
    },
  ]);
  return {
    gross: money(calculated.gross),
    discount: money(calculated.discount),
    subtotal: money(calculated.subtotal),
    dpp: money(calculated.dpp),
    tax: money(calculated.tax),
    total: money(calculated.total),
  };
}

export function calculateDeliveryInvoice(input: {
  lines: InvoiceSourceLine[];
  shipment: InvoiceQuantity[];
  previouslyBilled: InvoiceQuantity[];
  dpApplied: string;
  priorDpApplied: string;
  dpIssued: string;
  dpTax: string;
  dpDpp: string;
  verifiedPayments: string;
}) {
  const selected = new Map(input.shipment.map((item) => [item.lineId, quantity(item.quantity)]));
  if (selected.size !== input.shipment.length || !selected.size)
    throw new Error("Pengiriman tidak memiliki rincian barang yang valid.");
  const previous = new Map<string, bigint>();
  for (const item of input.previouslyBilled)
    previous.set(item.lineId, (previous.get(item.lineId) ?? BigInt(0)) + quantity(item.quantity));
  const rows = input.lines.flatMap((line) => {
    const shipped = selected.get(line.id) ?? BigInt(0);
    if (!shipped) return [];
    const before = previous.get(line.id) ?? BigInt(0);
    const after = before + shipped;
    if (after > quantity(line.quantity)) throw new Error("Jumlah barang yang ditagih melebihi order.");
    const oldValue = atQuantity(line, before);
    const newValue = atQuantity(line, after);
    const difference = (key: keyof typeof oldValue) => centsText(newValue[key] - oldValue[key]);
    return [
      {
        lineId: line.id,
        description: line.description,
        materialName: line.materialName ?? "",
        quantity: quantityText(shipped),
        unit: line.unit,
        unitPrice: line.unitPrice,
        taxMethod: line.taxMethod ?? "legacy",
        discountKind: line.discountKind ?? "none",
        discountValue: line.discountValue ?? "0",
        gross: difference("gross"),
        discount: difference("discount"),
        subtotal: difference("subtotal"),
        dpp: difference("dpp"),
        tax: difference("tax"),
        total: difference("total"),
      },
    ];
  });
  if (!rows.length || rows.length !== selected.size) throw new Error("Barang pengiriman tidak cocok dengan order.");
  const sum = (key: "gross" | "discount" | "subtotal" | "dpp" | "tax" | "total") =>
    rows.reduce((value, row) => value + money(row[key]), BigInt(0));
  const applied = money(input.dpApplied);
  const previouslyApplied = money(input.priorDpApplied);
  const dpIssued = money(input.dpIssued);
  if (
    applied < BigInt(0) ||
    previouslyApplied + applied > dpIssued ||
    previouslyApplied + applied > money(input.verifiedPayments)
  ) {
    throw new Error("DP yang diterapkan melebihi DP terbit atau pembayaran terverifikasi.");
  }
  if (applied > sum("total")) throw new Error("DP yang diterapkan melebihi nilai barang pada invoice ini.");
  const share = (part: string) =>
    dpIssued
      ? roundDivide(money(part) * (previouslyApplied + applied), dpIssued) -
        roundDivide(money(part) * previouslyApplied, dpIssued)
      : BigInt(0);
  const creditTax = share(input.dpTax);
  const creditDpp = share(input.dpDpp);
  if (creditTax > sum("tax") || creditDpp > sum("dpp"))
    throw new Error("Pembagian DP tidak cocok dengan pajak barang pada pengiriman ini.");
  return {
    kind: "final" as const,
    lines: rows,
    gross: centsText(sum("gross")),
    discount: centsText(sum("discount")),
    goodsSubtotal: centsText(sum("subtotal")),
    goodsTax: centsText(sum("tax")),
    goodsTotal: centsText(sum("total")),
    subtotal: centsText(sum("subtotal") - (applied - creditTax)),
    dpp: centsText(sum("dpp") - creditDpp),
    tax: centsText(sum("tax") - creditTax),
    dpApplied: centsText(applied),
    amountDue: centsText(sum("total") - applied),
  };
}
