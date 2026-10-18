import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Building, Store, TrendingUp, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, Stat } from "@/components/page-header";
import { addDays, today } from "@/lib/dates";
import { num } from "@/lib/format";
import { requireViewer } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Tenants" };

export default function TenantsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Tenants />
    </Suspense>
  );
}

async function Tenants() {
  const viewer = await requireViewer();
  if (viewer.role !== "PLATFORM_ADMIN") redirect("/dashboard");

  const since30 = addDays(today(), -30);
  const since7 = addDays(today(), -7);
  const dayAgo = new Date(new Date().getTime() - 24 * 3600 * 1000);

  const [orgs, forecasts24h, salesRows7d, outletsTotal] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { outlets: true, users: true, dishes: true } },
        outlets: { select: { id: true, name: true } },
      },
    }),
    prisma.forecast.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.salesRecord.count({ where: { date: { gte: since7 } } }),
    prisma.outlet.count(),
  ]);

  const rows = await Promise.all(
    orgs.map(async (o) => {
      const outletIds = o.outlets.map((x) => x.id);
      const [sales30, lastAudit, lastSale, activeModels] = await Promise.all([
        prisma.salesRecord.count({ where: { dish: { organizationId: o.id }, date: { gte: since30 } } }),
        prisma.auditLog.findFirst({ where: { organizationId: o.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true, action: true } }),
        prisma.salesRecord.findFirst({ where: { dish: { organizationId: o.id } }, orderBy: { date: "desc" }, select: { date: true } }),
        outletIds.length ? prisma.modelRun.count({ where: { outletId: { in: outletIds }, isActive: true } }) : 0,
      ]);
      return { ...o, sales30, lastAudit, lastSale, activeModels };
    }),
  );
  const totals = rows.reduce(
    (t, r) => ({ outlets: t.outlets + r._count.outlets, users: t.users + r._count.users, dishes: t.dishes + r._count.dishes, sales30: t.sales30 + r.sales30 }),
    { outlets: 0, users: 0, dishes: 0, sales30: 0 },
  );
  const planTone: Record<string, "default" | "secondary" | "outline"> = { ENTERPRISE: "default", PRO: "default", STARTER: "secondary", FREE: "outline" };

  return (
    <>
      <PageHeader title="All tenants" description="Every organisation on the platform, with usage and model health." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tenants" value={num(rows.length)} icon={<Building />} />
        <Stat label="Outlets" value={num(outletsTotal)} icon={<Store />} />
        <Stat label="Forecasts (24h)" value={num(forecasts24h)} hint="rows written by the nightly job" icon={<TrendingUp />} />
        <Stat label="Sales rows (7d)" value={num(salesRows7d)} hint="imported or logged" icon={<Upload />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organisations</CardTitle>
          <CardDescription>Sales rows are counted over the last 30 days. Last activity is the newest audit entry.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Outlets</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Dishes</TableHead>
                <TableHead className="text-right">Sales rows (30d)</TableHead>
                <TableHead className="text-right">Active models</TableHead>
                <TableHead>Last sale</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.name}
                    <div className="text-xs text-muted-foreground">{r.outlets.map((o) => o.name).join(", ") || "no outlets"}</div>
                  </TableCell>
                  <TableCell><Badge variant={planTone[r.plan] ?? "outline"}>{r.plan}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{r._count.outlets}</TableCell>
                  <TableCell className="text-right tabular-nums">{r._count.users}</TableCell>
                  <TableCell className="text-right tabular-nums">{r._count.dishes}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.sales30)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.activeModels}/{r._count.outlets}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.lastSale?.date ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.lastAudit ? `${r.lastAudit.createdAt.toLocaleString("en-IN")} · ${r.lastAudit.action}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{totals.outlets}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.users}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.dishes}</TableCell>
                <TableCell className="text-right tabular-nums">{num(totals.sales30)}</TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
