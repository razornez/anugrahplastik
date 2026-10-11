export type QuoteLineInput = {
  description: string;
  materialLabel?: string;
  mouldingLabel?: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxRate: string;
  taxMethod?: string;
  discountKind?: string;
  discountValue?: string;
};

function scaled(value: string, places: number) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("Angka harus positif dan memakai titik untuk desimal.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > places) throw new Error(`Maksimal ${places} angka di belakang koma.`);
  return BigInt(whole) * BigInt(10) ** BigInt(places) + BigInt(fraction.padEnd(places, "0") || "0");
}

export function roundDivide(value: bigint, divisor: bigint) {
  return (value + divisor / BigInt(2)) / divisor;
}

export function centsText(value: bigint) {
  return `${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2, "0")}`;
}

export function calculateQuote(lines: QuoteLineInput[]) {
  if (!lines.length) throw new Error("Tambahkan paling sedikit satu barang atau jasa.");
  let subtotalCents = BigInt(0);
  let grossCents = BigInt(0);
  let discountCents = BigInt(0);
  let dppCents = BigInt(0);
  let taxCents = BigInt(0);
  const details = lines.map((line) => {
    const quantityMillis = scaled(line.quantity, 3);
    const priceCents = scaled(line.unitPrice, 2);
    const taxMethod = line.taxMethod ?? "legacy";
    const discountKind = line.discountKind ?? "none";
    const discountValue = line.discountValue ?? "0";
    if (!["legacy", "none", "standard", "dpp_11_12"].includes(taxMethod)) throw new Error("Metode pajak tidak valid.");
    if (!["none", "amount", "percent"].includes(discountKind)) throw new Error("Jenis diskon tidak valid.");
    const taxBasisPoints = scaled(line.taxRate, 2);
    if (!quantityMillis || !priceCents) throw new Error("Jumlah dan harga harus lebih dari nol.");
    if (taxBasisPoints > BigInt(10000)) throw new Error("Pajak tidak boleh lebih dari 100%.");
    const baseCents = roundDivide(quantityMillis * priceCents, BigInt(1000));
    const discount =
      discountKind === "amount"
        ? scaled(discountValue, 2)
        : discountKind === "percent"
          ? roundDivide(baseCents * scaled(discountValue, 2), BigInt(10000))
          : BigInt(0);
    if (discountKind === "percent" && scaled(discountValue, 2) > BigInt(10000))
      throw new Error("Diskon tidak boleh lebih dari 100%.");
    if (discount > baseCents) throw new Error("Diskon tidak boleh melebihi total harga item.");
    const netCents = baseCents - discount;
    const dpp = taxMethod === "dpp_11_12" ? roundDivide(netCents * BigInt(11), BigInt(12)) : netCents;
    const rate = taxMethod === "none" ? BigInt(0) : taxMethod === "legacy" ? taxBasisPoints : BigInt(1200);
    const lineTaxCents = roundDivide(dpp * rate, BigInt(10000));
    grossCents += baseCents;
    discountCents += discount;
    subtotalCents += netCents;
    dppCents += dpp;
    taxCents += lineTaxCents;
    return {
      ...line,
      taxMethod,
      discountKind,
      discountValue,
      gross: centsText(baseCents),
      discount: centsText(discount),
      subtotal: centsText(netCents),
      dpp: centsText(dpp),
      tax: centsText(lineTaxCents),
      total: centsText(netCents + lineTaxCents),
    };
  });
  const totalCents = subtotalCents + taxCents;
  if (totalCents > BigInt("100000000000000")) throw new Error("Nilai penawaran terlalu besar.");
  return {
    lines: details,
    gross: centsText(grossCents),
    discount: centsText(discountCents),
    subtotal: centsText(subtotalCents),
    dpp: centsText(dppCents),
    tax: centsText(taxCents),
    total: centsText(totalCents),
  };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function quoteSnapshotMatches(snapshot: unknown, lines: QuoteLineInput[]) {
  if (!snapshot || typeof snapshot !== "object" || !lines.length) return false;
  try {
    const current = calculateQuote(lines);
    if (canonicalJson(snapshot) === canonicalJson(current)) return true;
    // PDFs created before discounts and explicit tax methods retain their original snapshot shape.
    if (lines.some((line) => line.taxMethod && line.taxMethod !== "legacy")) return false;
    if (lines.some((line) => line.discountKind && line.discountKind !== "none")) return false;
    const legacy = {
      lines: current.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
        subtotal: line.subtotal,
        tax: line.tax,
      })),
      subtotal: current.subtotal,
      tax: current.tax,
      total: current.total,
    };
    return canonicalJson(snapshot) === canonicalJson(legacy);
  } catch {
    return false;
  }
}
