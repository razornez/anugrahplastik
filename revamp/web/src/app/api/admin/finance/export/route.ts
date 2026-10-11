import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/database/client";
import { auditLogs } from "@/lib/database/schema";
import {
  FinanceReportInputError,
  getFinanceReport,
  parseFinanceReportQuery,
  renderFinancePdf,
  renderFinanceWorkbook,
} from "@/features/finance/finance-report";

function filenamePart(value: string) {
  return value.replace(/[^0-9-]/g, "");
}

export async function GET(request: Request) {
  const user = await getSession();
  if (!user || !["admin", "sales"].includes(user.role))
    return Response.json({ error: "Tidak memiliki akses laporan Keuangan." }, { status: 403 });
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (format !== "pdf" && format !== "xlsx")
    return Response.json({ error: "Format ekspor tidak valid." }, { status: 400 });
  try {
    const query = parseFinanceReportQuery(url.searchParams);
    const report = await getFinanceReport(query);
    if (!report) return Response.json({ error: "Database belum tersedia." }, { status: 503 });
    const body = format === "pdf" ? await renderFinancePdf(report) : await renderFinanceWorkbook(report);
    const database = getDatabase();
    await database?.insert(auditLogs).values({
      actorId: user.id,
      action: "finance.report_exported",
      entityType: "finance_report",
      metadata: {
        format,
        from: query.from,
        to: query.to,
        accountId: query.account ?? null,
        entryCount: report.summary.entryCount,
      },
    });
    const filename = `laporan-keuangan-${filenamePart(query.from)}_sampai_${filenamePart(query.to)}.${format}`;
    return new Response(body, {
      headers: {
        "content-type":
          format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof FinanceReportInputError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Laporan belum dapat dibuat. Coba lagi." }, { status: 500 });
  }
}
