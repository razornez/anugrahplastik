import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/lib/database/client";
import {
  businessTransactions,
  financeAccounts,
  financeCategories,
  financeEntries,
  suppliers,
  transactionInvoices,
} from "@/lib/database/schema";

const MAX_REPORT_ENTRIES = 5_000;
const jakartaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const jakartaReadableDate = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium" });
const jakartaDateTime = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});
const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export type FinanceReportQuery = { from: string; to: string; account?: string };

export class FinanceReportInputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function todayWib() {
  return jakartaDate.format(new Date());
}

function firstDayWib() {
  const [year, month] = todayWib().split("-");
  return `${year}-${month}-01`;
}

function timestampForDate(value: string, endOfDay = false) {
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+07:00`);
}

export function parseFinanceReportQuery(values: URLSearchParams): FinanceReportQuery {
  const input = z
    .object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      account: z.string().uuid().optional(),
    })
    .safeParse({
      from: values.get("from") || undefined,
      to: values.get("to") || undefined,
      account: values.get("account") || undefined,
    });
  if (!input.success) throw new FinanceReportInputError("Filter laporan tidak valid.");
  const query = {
    from: input.data.from ?? firstDayWib(),
    to: input.data.to ?? todayWib(),
    account: input.data.account,
  };
  if (query.from > query.to) throw new FinanceReportInputError("Tanggal awal tidak boleh setelah tanggal akhir.");
  return query;
}

function number(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function csvSafeText(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
}

function printableText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s/g, " ")
    .replace(/[•·]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, "?");
}

export async function getFinanceReport(query: FinanceReportQuery) {
  const database = getDatabase();
  if (!database) return null;
  const from = timestampForDate(query.from);
  const to = timestampForDate(query.to, true);
  const [allAccounts, rows, invoices] = await Promise.all([
    database.select().from(financeAccounts).orderBy(financeAccounts.name),
    database
      .select({
        entry: financeEntries,
        accountName: financeAccounts.name,
        accountMasked: financeAccounts.accountNoMasked,
        categoryName: financeCategories.name,
        supplierName: suppliers.name,
        transactionReference: businessTransactions.referenceNo,
      })
      .from(financeEntries)
      .innerJoin(financeAccounts, eq(financeAccounts.id, financeEntries.accountId))
      .leftJoin(financeCategories, eq(financeCategories.id, financeEntries.categoryId))
      .leftJoin(suppliers, eq(suppliers.id, financeEntries.supplierId))
      .leftJoin(businessTransactions, eq(businessTransactions.id, financeEntries.transactionId))
      .where(
        and(
          gte(financeEntries.occurredAt, from),
          lte(financeEntries.occurredAt, to),
          query.account ? eq(financeEntries.accountId, query.account) : undefined,
        ),
      )
      .orderBy(asc(financeEntries.occurredAt), asc(financeEntries.createdAt))
      .limit(MAX_REPORT_ENTRIES + 1),
    database
      .select({
        invoiceNo: transactionInvoices.invoiceNo,
        amount: transactionInvoices.amount,
        dueAt: transactionInvoices.dueAt,
        status: transactionInvoices.status,
        transactionReference: businessTransactions.referenceNo,
        customerName: sql<string>`coalesce(${businessTransactions.title}, '')`,
      })
      .from(transactionInvoices)
      .innerJoin(businessTransactions, eq(businessTransactions.id, transactionInvoices.transactionId))
      .where(
        and(
          eq(businessTransactions.dataClass, "production"),
          inArray(transactionInvoices.status, ["issued", "sent", "partial", "overdue"]),
          isNull(businessTransactions.cancelledAt),
        ),
      )
      .orderBy(transactionInvoices.dueAt),
  ]);
  if (rows.length > MAX_REPORT_ENTRIES)
    throw new FinanceReportInputError("Terlalu banyak catatan untuk diekspor. Persempit rentang tanggal.", 422);
  const accounts = query.account ? allAccounts.filter((account) => account.id === query.account) : allAccounts;
  if (query.account && !accounts.length) throw new FinanceReportInputError("Rekening tidak ditemukan.", 404);
  const balances = await Promise.all(
    accounts.map(async (account) => {
      const [totals] = await database
        .select({
          incoming: sql<string>`coalesce(sum(${financeEntries.amount}) filter (where ${financeEntries.status} = 'verified' and ${financeEntries.direction} = 'in'), 0)`,
          outgoing: sql<string>`coalesce(sum(${financeEntries.amount}) filter (where ${financeEntries.status} = 'verified' and ${financeEntries.direction} = 'out'), 0)`,
        })
        .from(financeEntries)
        .where(eq(financeEntries.accountId, account.id));
      return { ...account, balance: number(totals?.incoming) - number(totals?.outgoing) };
    }),
  );
  const verified = rows.filter(({ entry }) => entry.status === "verified");
  const incoming = verified
    .filter(({ entry }) => entry.direction === "in")
    .reduce((sum, row) => sum + number(row.entry.amount), 0);
  const outgoing = verified
    .filter(({ entry }) => entry.direction === "out")
    .reduce((sum, row) => sum + number(row.entry.amount), 0);
  const pendingCount = rows.filter(({ entry }) => entry.status === "pending").length;
  const rejectedCount = rows.filter(({ entry }) => entry.status === "rejected").length;
  return {
    query,
    generatedAt: new Date(),
    entries: rows,
    accounts: balances,
    invoices,
    summary: { incoming, outgoing, net: incoming - outgoing, pendingCount, rejectedCount, entryCount: rows.length },
  };
}

type FinanceReport = NonNullable<Awaited<ReturnType<typeof getFinanceReport>>>;

function statusLabel(value: string) {
  return (
    { pending: "Menunggu verifikasi", verified: "Terverifikasi", rejected: "Ditolak", void: "Dibatalkan" }[value] ??
    value
  );
}

function directionLabel(value: string) {
  return value === "in" ? "Masuk" : "Keluar";
}

function reportPeriod(report: FinanceReport) {
  return `${jakartaReadableDate.format(timestampForDate(report.query.from))} - ${jakartaReadableDate.format(
    timestampForDate(report.query.to),
  )}`;
}

function addSheetTitle(sheet: ExcelJS.Worksheet, title: string, detail: string, columns: string[]) {
  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF102B4E" } };
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 28;
  sheet.mergeCells(2, 1, 2, columns.length);
  sheet.getCell(2, 1).value = detail;
  sheet.getCell(2, 1).font = { italic: true, color: { argb: "FF4B5563" } };
  sheet.addRow([]);
  const header = sheet.addRow(columns);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1766C9" } };
  header.alignment = { vertical: "middle", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 4 }];
}

function formatWorksheet(sheet: ExcelJS.Worksheet, widths: number[], currencyColumns: number[] = []) {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  for (let row = 5; row <= sheet.rowCount; row += 1) {
    sheet.getRow(row).alignment = { vertical: "top", wrapText: true };
    currencyColumns.forEach((column) => {
      sheet.getCell(row, column).numFmt = "[$Rp-421]#,##0;[Red]-[$Rp-421]#,##0";
    });
  }
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, sheet.rowCount), column: widths.length } };
}

export async function renderFinanceWorkbook(report: FinanceReport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Anugrah Plastik";
  workbook.created = report.generatedAt;
  const detail = `Periode ${reportPeriod(report)} | Dicetak ${jakartaDateTime.format(report.generatedAt)} WIB`;
  const summary = workbook.addWorksheet("Ringkasan");
  addSheetTitle(summary, "Laporan Keuangan - Ringkasan", detail, ["Keterangan", "Nilai"]);
  summary.addRows([
    ["Rekening", report.query.account ? (report.accounts[0]?.name ?? "-") : "Semua rekening"],
    ["Uang masuk tervalidasi", report.summary.incoming],
    ["Uang keluar tervalidasi", report.summary.outgoing],
    ["Arus bersih", report.summary.net],
    ["Catatan menunggu verifikasi", report.summary.pendingCount],
    ["Catatan ditolak", report.summary.rejectedCount],
    ["Total catatan diekspor", report.summary.entryCount],
  ]);
  formatWorksheet(summary, [34, 28], [2]);

  const ledger = workbook.addWorksheet("Catatan Keuangan");
  addSheetTitle(ledger, "Laporan Keuangan - Catatan", `${detail} | Semua status catatan`, [
    "Tanggal WIB",
    "Status",
    "Arah",
    "Kategori",
    "Jenis",
    "Rekening",
    "Lawan transaksi",
    "Referensi",
    "Catatan",
    "Masuk",
    "Keluar",
    "Diverifikasi",
    "Direkonsiliasi",
  ]);
  report.entries.forEach(({ entry, accountName, categoryName, supplierName, transactionReference }) => {
    ledger.addRow([
      jakartaReadableDate.format(entry.occurredAt),
      statusLabel(entry.status),
      directionLabel(entry.direction),
      csvSafeText(categoryName),
      csvSafeText(entry.kind),
      csvSafeText(accountName),
      csvSafeText(entry.counterpartyName ?? supplierName ?? ""),
      csvSafeText(entry.reference ?? transactionReference ?? ""),
      csvSafeText(entry.notes),
      entry.direction === "in" ? number(entry.amount) : 0,
      entry.direction === "out" ? number(entry.amount) : 0,
      entry.verifiedAt ? jakartaDateTime.format(entry.verifiedAt) : "",
      entry.reconciledAt ? jakartaDateTime.format(entry.reconciledAt) : "",
    ]);
  });
  formatWorksheet(ledger, [16, 19, 10, 24, 18, 24, 30, 22, 38, 16, 16, 21, 21], [10, 11]);

  const accounts = workbook.addWorksheet("Rekening");
  addSheetTitle(accounts, "Laporan Keuangan - Rekening", `${detail} | Saldo buku saat dicetak`, [
    "Rekening",
    "Bank",
    "Nomor rekening",
    "Status",
    "Saldo buku",
    "Rekonsiliasi terakhir",
  ]);
  report.accounts.forEach((account) =>
    accounts.addRow([
      csvSafeText(account.name),
      csvSafeText(account.bankName),
      csvSafeText(account.accountNoMasked),
      statusLabel(account.status),
      account.balance,
      account.reconciledAt ? jakartaDateTime.format(account.reconciledAt) : "Belum direkonsiliasi",
    ]),
  );
  formatWorksheet(accounts, [30, 22, 22, 16, 20, 26], [5]);

  const invoices = workbook.addWorksheet("Piutang");
  addSheetTitle(invoices, "Laporan Keuangan - Piutang", `${detail} | Piutang operasional terbuka saat diekspor`, [
    "Nomor invoice",
    "Referensi transaksi",
    "Pelanggan",
    "Jatuh tempo",
    "Status",
    "Nilai piutang",
  ]);
  report.invoices.forEach((invoice) =>
    invoices.addRow([
      csvSafeText(invoice.invoiceNo),
      csvSafeText(invoice.transactionReference),
      csvSafeText(invoice.customerName),
      invoice.dueAt ? jakartaReadableDate.format(invoice.dueAt) : "Belum diisi",
      statusLabel(invoice.status),
      number(invoice.amount),
    ]),
  );
  formatWorksheet(invoices, [22, 22, 34, 18, 18, 20], [6]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function pdfLines(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = printableText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function renderFinancePdf(report: FinanceReport) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let logo: Awaited<ReturnType<typeof document.embedPng>> | null = null;
  try {
    logo = await document.embedPng(await readFile(resolve(process.cwd(), "public", "brand", "quotation-logo.png")));
  } catch {
    // A report remains usable if a local brand asset is unavailable.
  }
  const size: [number, number] = [841.89, 595.28];
  const margin = 34;
  const navy = rgb(0.04, 0.14, 0.28);
  const blue = rgb(0.09, 0.4, 0.79);
  const ink = rgb(0.08, 0.1, 0.14);
  const muted = rgb(0.32, 0.36, 0.43);
  const line = rgb(0.82, 0.86, 0.91);
  const soft = rgb(0.95, 0.97, 0.99);
  let page!: PDFPage;
  let y = 0;
  const newPage = (section?: string) => {
    page = document.addPage(size);
    page.drawRectangle({ x: 0, y: size[1] - 10, width: size[0], height: 10, color: navy });
    if (logo) page.drawImage(logo, { x: margin, y: size[1] - 61, width: 44, height: 29 });
    page.drawText("ANUGRAH PLASTIK", {
      x: margin + (logo ? 55 : 0),
      y: size[1] - 43,
      size: 13,
      font: bold,
      color: navy,
    });
    page.drawText(section ?? "Laporan Keuangan", {
      x: margin + (logo ? 55 : 0),
      y: size[1] - 58,
      size: 8,
      font: regular,
      color: muted,
    });
    page.drawText(`Periode ${reportPeriod(report)}`, {
      x: size[0] - margin - 192,
      y: size[1] - 43,
      size: 8,
      font: regular,
    });
    page.drawText(`Dicetak ${jakartaDateTime.format(report.generatedAt)} WIB`, {
      x: size[0] - margin - 192,
      y: size[1] - 58,
      size: 8,
      font: regular,
      color: muted,
    });
    page.drawLine({
      start: { x: margin, y: size[1] - 75 },
      end: { x: size[0] - margin, y: size[1] - 75 },
      color: line,
      thickness: 0.7,
    });
    y = size[1] - 102;
  };

  const drawLines = (
    value: string,
    x: number,
    top: number,
    width: number,
    font = regular,
    fontSize = 9,
    lineHeight = 12,
  ) => {
    const lines = pdfLines(font, value, fontSize, width);
    lines.forEach((item, index) =>
      page.drawText(item, { x, y: top - index * lineHeight, size: fontSize, font, color: ink }),
    );
    return lines.length;
  };
  const drawCard = (x: number, label: string, value: string, accent: ReturnType<typeof rgb>) => {
    const width = (size[0] - margin * 2 - 24) / 4;
    page.drawRectangle({ x, y: y - 72, width, height: 70, color: soft, borderColor: line, borderWidth: 0.7 });
    page.drawRectangle({ x, y: y - 72, width: 4, height: 70, color: accent });
    page.drawText(label, { x: x + 14, y: y - 22, size: 8, font: regular, color: muted });
    page.drawText(value, { x: x + 14, y: y - 49, size: 14, font: bold, color: navy });
  };
  const panelHeight = (rows: string[], width: number, empty: string) => {
    const content = (rows.length ? rows : [empty]).slice(0, 5);
    const contentHeight = content.reduce(
      (total, row) => total + Math.max(22, pdfLines(regular, row, 8.1, width - 28).length * 10 + 7),
      0,
    );
    return Math.min(164, Math.max(96, 49 + contentHeight + (rows.length > 5 ? 15 : 0)));
  };
  const drawPanel = (
    x: number,
    top: number,
    width: number,
    height: number,
    title: string,
    rows: string[],
    empty: string,
  ) => {
    page.drawRectangle({ x, y: top - height, width, height, color: rgb(1, 1, 1), borderColor: line, borderWidth: 0.7 });
    page.drawRectangle({ x, y: top - 31, width, height: 31, color: soft });
    page.drawText(title, { x: x + 14, y: top - 20, size: 10, font: bold, color: navy });
    const content = rows.length ? rows : [empty];
    let rowTop = top - 49;
    content.slice(0, 5).forEach((row, index) => {
      if (index)
        page.drawLine({
          start: { x: x + 14, y: rowTop + 6 },
          end: { x: x + width - 14, y: rowTop + 6 },
          color: rgb(0.9, 0.92, 0.95),
          thickness: 0.45,
        });
      const lines = drawLines(row, x + 14, rowTop, width - 28, regular, 8.1, 10);
      rowTop -= Math.max(22, lines * 10 + 7);
    });
    if (rows.length > 5)
      page.drawText(`+${rows.length - 5} data lainnya tersedia di Excel`, {
        x: x + 14,
        y: top - height + 13,
        size: 7.5,
        font: regular,
        color: muted,
      });
  };

  newPage("Laporan Keuangan");
  page.drawText("Laporan Keuangan", { x: margin, y, size: 24, font: bold, color: navy });
  page.drawText(
    `Ringkasan arus dana operasional | ${report.query.account ? (report.accounts[0]?.name ?? "Rekening dipilih") : "Semua rekening"}`,
    { x: margin, y: y - 19, size: 9, font: regular, color: muted },
  );
  y -= 50;
  const cards = [
    ["Uang masuk tervalidasi", rupiah.format(report.summary.incoming), rgb(0.1, 0.49, 0.31)],
    ["Uang keluar tervalidasi", rupiah.format(report.summary.outgoing), rgb(0.78, 0.22, 0.2)],
    ["Arus bersih periode", rupiah.format(report.summary.net), blue],
    [
      "Perlu ditinjau",
      `${report.summary.pendingCount} pending | ${report.summary.rejectedCount} ditolak`,
      rgb(0.75, 0.46, 0.06),
    ],
  ] as const;
  const cardWidth = (size[0] - margin * 2 - 24) / 4;
  cards.forEach(([label, value, accent], index) => {
    drawCard(margin + index * (cardWidth + 8), label, value, accent);
  });
  y -= 94;
  const accountRows = report.accounts.map(
    (account) => `${account.name} | ${account.bankName} ${account.accountNoMasked} | ${rupiah.format(account.balance)}`,
  );
  const invoiceRows = report.invoices.map(
    (invoice) =>
      `${invoice.invoiceNo} | ${invoice.customerName || "Pelanggan"} | ${rupiah.format(number(invoice.amount))} | ${statusLabel(invoice.status)}`,
  );
  const panelHeightValue = Math.max(
    panelHeight(accountRows, 372, "Tidak ada rekening sesuai filter."),
    panelHeight(invoiceRows, 386, "Tidak ada invoice terbuka saat laporan dibuat."),
  );
  drawPanel(
    margin,
    y,
    372,
    panelHeightValue,
    "Saldo rekening saat dicetak",
    accountRows,
    "Tidak ada rekening sesuai filter.",
  );
  drawPanel(
    margin + 387,
    y,
    386,
    panelHeightValue,
    "Piutang operasional terbuka",
    invoiceRows,
    "Tidak ada invoice terbuka saat laporan dibuat.",
  );
  const noteY = y - panelHeightValue - 46;
  page.drawRectangle({
    x: margin,
    y: noteY,
    width: size[0] - margin * 2,
    height: 36,
    color: soft,
    borderColor: line,
    borderWidth: 0.6,
  });
  page.drawText(
    `Rincian ledger memuat ${report.summary.entryCount} catatan dari seluruh status. File Excel memuat data siap olah dengan empat sheet laporan.`,
    { x: margin + 12, y: noteY + 14, size: 8.5, font: regular, color: muted },
  );

  newPage("Catatan Keuangan");
  page.drawText("Rincian Catatan Keuangan", { x: margin, y, size: 18, font: bold, color: navy });
  page.drawText("Semua status catatan ditampilkan untuk kebutuhan pemeriksaan dan audit.", {
    x: margin,
    y: y - 16,
    size: 8.5,
    font: regular,
    color: muted,
  });
  y -= 37;
  const columns = [
    ["Tanggal", 70],
    ["Status", 92],
    ["Keterangan", 244],
    ["Rekening", 155],
    ["Masuk", 106],
    ["Keluar", 106],
  ] as const;
  const drawLedgerHeader = () => {
    let x = margin;
    page.drawRectangle({ x: margin, y: y - 20, width: size[0] - margin * 2, height: 24, color: navy });
    columns.forEach(([label, width]) => {
      page.drawText(label, { x: x + 7, y: y - 11, size: 7.5, font: bold, color: rgb(1, 1, 1) });
      x += width;
    });
    y -= 30;
  };
  drawLedgerHeader();
  if (!report.entries.length) {
    page.drawText("Tidak ada catatan pada periode ini.", { x: margin, y, size: 10, font: regular, color: muted });
  }
  report.entries.forEach(({ entry, accountName, categoryName, supplierName }, entryIndex) => {
    const description = `${entry.counterpartyName ?? supplierName ?? categoryName ?? "Catatan keuangan"}${entry.reference ? ` (${entry.reference})` : ""}`;
    const cells = [
      jakartaReadableDate.format(entry.occurredAt),
      statusLabel(entry.status),
      description,
      accountName,
      entry.direction === "in" ? rupiah.format(number(entry.amount)) : "",
      entry.direction === "out" ? rupiah.format(number(entry.amount)) : "",
    ];
    const lines = cells.map((cell, index) => pdfLines(regular, cell, 7.6, columns[index][1] - 14));
    const height = Math.max(32, Math.max(...lines.map((item) => item.length)) * 10 + 18);
    if (y - height < 42) {
      newPage("Catatan Keuangan");
      page.drawText("Rincian Catatan Keuangan (lanjutan)", { x: margin, y, size: 14, font: bold, color: navy });
      y -= 24;
      drawLedgerHeader();
    }
    if (entryIndex % 2 === 0) {
      page.drawRectangle({ x: margin, y: y - height, width: size[0] - margin * 2, height, color: soft });
    }
    let x = margin;
    lines.forEach((cellLines, index) => {
      cellLines.forEach((line, lineIndex) =>
        page.drawText(line, { x: x + 7, y: y - 14 - lineIndex * 10, size: 7.6, font: regular, color: ink }),
      );
      x += columns[index][1];
    });
    y -= height;
    page.drawLine({
      start: { x: margin, y },
      end: { x: size[0] - margin, y },
      color: line,
      thickness: 0.4,
    });
  });
  const totalPages = document.getPageCount();
  document.getPages().forEach((reportPage, index) => {
    reportPage.drawLine({
      start: { x: margin, y: 32 },
      end: { x: size[0] - margin, y: 32 },
      color: line,
      thickness: 0.5,
    });
    reportPage.drawText("Anugrah Plastik | Laporan internal", {
      x: margin,
      y: 19,
      size: 7.5,
      font: regular,
      color: muted,
    });
    reportPage.drawText(`Halaman ${index + 1} dari ${totalPages}`, {
      x: size[0] - margin - 72,
      y: 19,
      size: 7.5,
      font: regular,
      color: muted,
    });
  });
  return Buffer.from(await document.save());
}
