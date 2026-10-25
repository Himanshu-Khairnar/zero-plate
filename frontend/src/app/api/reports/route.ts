import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import * as XLSX from "xlsx";

import { ApiError, handle, requireOutletAccess, requireString } from "@/lib/api";
import { isIsoDate } from "@/lib/dates";
import { buildReport, lastMonth, type Report } from "@/lib/reports";

/** GET /api/reports?outletId&start&end&format=xlsx|pdf|csv */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const outletId = requireString(url.searchParams.get("outletId"), "outletId");
  await requireOutletAccess(outletId);
  const fallback = lastMonth();
  const start = url.searchParams.get("start") ?? fallback.start;
  const end = url.searchParams.get("end") ?? fallback.end;
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) throw new ApiError("start/end must be YYYY-MM-DD with start <= end.");
  const format = url.searchParams.get("format") ?? "xlsx";

  const report = await buildReport(outletId, { start, end });
  const slug = report.outlet.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const base = `wasteless-${slug}-${start}-to-${end}`;

  if (format === "csv") {
    const header = "date,plates,revenue,waste_plates,waste_cost";
    const body = report.days.map((d) => [d.date, d.plates, d.revenue, d.wastePlates, d.wasteCost].join(",")).join("\n");
    return new Response(`${header}\n${body}\n`, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${base}.csv"` },
    });
  }
  if (format === "pdf") {
    const bytes = await renderPdf(report);
    return new Response(bytes as unknown as BodyInit, {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${base}.pdf"` },
    });
  }
  if (format === "xlsx") {
    const buf = renderXlsx(report);
    return new Response(buf as unknown as BodyInit, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${base}.xlsx"`,
      },
    });
  }
  throw new ApiError("format must be xlsx, pdf or csv.");
});

function renderXlsx(r: Report): Buffer {
  const wb = XLSX.utils.book_new();
  const summary = [
    ["Zero Plate report", r.outlet.name],
    ["Period", `${r.period.start} to ${r.period.end}`],
    ["Generated", r.generatedAt],
    [],
    ["Metric", "Value"],
    ["Days", r.totals.days],
    ["Plates sold", r.totals.plates],
    ["Revenue (INR)", r.totals.revenue],
    ["Plates wasted", r.totals.wastePlates],
    ["Waste cost (INR)", r.totals.wasteCost],
    ["Waste share of plates (%)", r.totals.wasteSharePct ?? ""],
    ["Forecast MAPE (%)", r.totals.forecastMape ?? ""],
    ["Actuals inside forecast range (%)", r.totals.forecastCoverage ?? ""],
    ["Meals donated", r.totals.mealsDonated],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(r.days.map((d) => ({ Date: d.date, Plates: d.plates, "Revenue (INR)": d.revenue, "Waste plates": d.wastePlates, "Waste cost (INR)": d.wasteCost }))),
    "Sales by day",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(r.dishes.map((d) => ({ Dish: d.name, Category: d.category, Plates: d.plates, "Revenue (INR)": d.revenue, "Waste plates": d.wastePlates, "Waste cost (INR)": d.wasteCost }))),
    "Sales by dish",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(r.waste.map((w) => ({ Reason: w.reason, Quantity: w.qty, "Cost (INR)": w.cost, Entries: w.entries }))),
    "Waste",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(r.accuracy.map((a) => ({ Date: a.date, "Forecast plates": a.forecast, "Actual plates": a.actual, "Abs error": a.absError, "Dishes inside range": a.inside, "Dishes forecast": a.total }))),
    "Forecast accuracy",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(r.adherence.map((a) => ({ Date: a.date, Status: a.status, "Planned plates": a.planned, "Sold plates": a.sold }))),
    "Prep adherence",
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function renderPdf(r: Report): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]); // A4
  let y = 800;
  const margin = 48;

  const text = (s: string, size: number, f: PDFFont = font, x = margin) => {
    page.drawText(s, { x, y, size, font: f, color: rgb(0.12, 0.14, 0.13) });
    y -= size + 6;
  };
  const ensure = (needed: number) => {
    if (y - needed < 48) {
      page = doc.addPage([595, 842]);
      y = 800;
    }
  };
  const table = (title: string, header: string[], rows: string[][], widths: number[]) => {
    ensure(60);
    text(title, 12, bold);
    const rowH = 16;
    const drawRow = (cells: string[], f: PDFFont, shade: boolean, p: PDFPage) => {
      if (shade) p.drawRectangle({ x: margin, y: y - 4, width: widths.reduce((a, b) => a + b, 0), height: rowH, color: rgb(0.94, 0.95, 0.94) });
      let x = margin + 4;
      cells.forEach((c, i) => {
        p.drawText(c.length > 38 ? `${c.slice(0, 37)}…` : c, { x, y, size: 9, font: f, color: rgb(0.15, 0.15, 0.15) });
        x += widths[i];
      });
      y -= rowH;
    };
    drawRow(header, bold, true, page);
    rows.forEach((row, i) => {
      ensure(rowH + 4);
      drawRow(row, font, i % 2 === 1, page);
    });
    y -= 10;
  };
  const inr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

  text("Zero Plate report", 20, bold);
  text(`${r.outlet.name} · ${r.outlet.city}`, 12);
  text(`Period ${r.period.start} to ${r.period.end} · generated ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC`, 9);
  y -= 8;

  table(
    "Summary",
    ["Metric", "Value"],
    [
      ["Plates sold", String(r.totals.plates)],
      ["Revenue", inr(r.totals.revenue)],
      ["Plates wasted", String(r.totals.wastePlates)],
      ["Waste cost", inr(r.totals.wasteCost)],
      ["Waste share of plates", r.totals.wasteSharePct != null ? `${r.totals.wasteSharePct}%` : "—"],
      ["Forecast MAPE", r.totals.forecastMape != null ? `${r.totals.forecastMape}%` : "—"],
      ["Actuals inside forecast range", r.totals.forecastCoverage != null ? `${r.totals.forecastCoverage}%` : "—"],
      ["Meals donated", String(r.totals.mealsDonated)],
    ],
    [260, 200],
  );
  table(
    "Top dishes by revenue",
    ["Dish", "Plates", "Revenue", "Waste cost"],
    r.dishes.slice(0, 10).map((d) => [d.name, String(d.plates), inr(d.revenue), inr(d.wasteCost)]),
    [220, 80, 100, 100],
  );
  table(
    "Top wasted dishes",
    ["Dish", "Plates wasted", "Waste cost"],
    r.topWasted.length ? r.topWasted.map((d) => [d.name, String(d.wastePlates), inr(d.wasteCost)]) : [["No waste logged in this period", "", ""]],
    [260, 120, 120],
  );
  table(
    "Waste by reason",
    ["Reason", "Quantity", "Cost", "Entries"],
    r.waste.length ? r.waste.map((w) => [w.reason.replace("_", " "), String(w.qty), inr(w.cost), String(w.entries)]) : [["No waste logged", "", "", ""]],
    [200, 100, 100, 80],
  );
  table(
    "Sales by day",
    ["Date", "Plates", "Revenue", "Waste plates", "Waste cost"],
    r.days.map((d) => [d.date, String(d.plates), inr(d.revenue), String(d.wastePlates), inr(d.wasteCost)]),
    [110, 80, 110, 100, 100],
  );
  return doc.save();
}
