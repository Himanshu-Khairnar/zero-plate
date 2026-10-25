import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SalesImport } from "@/components/sales/sales-import";
import { EmptyState, PageHeader, Stat } from "@/components/page-header";
import { OutletPicker } from "@/components/url-controls";
import { addDays, formatDate, today } from "@/lib/dates";
import { inr, num } from "@/lib/format";
import { resolveOutlet } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Sales import" };

type Search = Promise<{ outlet?: string }>;

export default function SalesPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Sales searchParams={searchParams} />
    </Suspense>
  );
}

async function Sales({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet" />;

  const since = addDays(today(), -13);
  const [dishes, recent, totals, latest] = await Promise.all([
    prisma.dish.findMany({ where: { outletId: outlet.id, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, price: true } }),
    prisma.salesRecord.groupBy({ by: ["date"], where: { dish: { outletId: outlet.id }, date: { gte: since } }, _sum: { qtySold: true }, _count: { _all: true }, orderBy: { date: "desc" } }),
    prisma.salesRecord.aggregate({ where: { dish: { outletId: outlet.id } }, _count: { _all: true }, _min: { date: true }, _max: { date: true } }),
    prisma.salesRecord.findMany({ where: { dish: { outletId: outlet.id }, date: { gte: since } }, select: { date: true, qtySold: true, price: true } }),
  ]);
  const revenueByDay = new Map<string, number>();
  for (const r of latest) revenueByDay.set(r.date, (revenueByDay.get(r.date) ?? 0) + r.qtySold * r.price);

  return (
    <>
      <PageHeader title="Sales data" description="Get historical and daily sales into Zero Plate cleanly: upload a file, type a day in, or let the POS push it.">
        <OutletPicker outlets={outlets} value={outlet.id} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Sales rows" value={num(totals._count._all)} hint={totals._min.date ? `${formatDate(totals._min.date)} → ${formatDate(totals._max.date!)}` : "nothing imported yet"} />
        <Stat label="Days with data (last 14)" value={recent.length} hint={recent.length < 14 ? `${14 - recent.length} days missing` : "complete"} tone={recent.length >= 12 ? "good" : "muted"} />
        <Stat label="Dishes on the menu" value={dishes.length} hint="rows are matched to these names" />
      </div>

      <SalesImport outletId={outlet.id} dishes={dishes} />

      <Card>
        <CardHeader>
          <CardTitle>Last 14 days</CardTitle>
          <CardDescription>What the forecaster will train on. Gaps show as missing days.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales in the last two weeks.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Plates</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((r) => (
                  <TableRow key={r.date}>
                    <TableCell>{formatDate(r.date, { weekday: "short", day: "numeric", month: "short" })}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(r._sum.qtySold ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(revenueByDay.get(r.date) ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r._count._all}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
