import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AuditFilters } from "@/components/admin/audit-filters";
import { EmptyState } from "@/components/page-header";
import { isIsoDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

export type AuditSearch = { action?: string; from?: string; to?: string; page?: string };

/** Server component: paginated, filterable audit log, scoped by `where`. */
export async function AuditTable({ search, organizationId, basePath }: { search: AuditSearch; organizationId: string | null | undefined; basePath: string }) {
  const page = Math.max(1, Number(search.page ?? 1) || 1);
  const action = (search.action ?? "").trim();
  const from = isIsoDate(search.from) ? search.from : undefined;
  const to = isIsoDate(search.to) ? search.to : undefined;
  const where = {
    ...(organizationId === undefined ? {} : { organizationId }),
    ...(action ? { action: { startsWith: action } } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}) } }
      : {}),
  };
  const [rows, total, actions] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where: organizationId === undefined ? {} : { organizationId }, distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const sp = new URLSearchParams();
    if (action) sp.set("action", action);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const prefixes = [...new Set(actions.map((a) => a.action.split(".")[0]))];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>{total.toLocaleString("en-IN")} entries. Every write through the app is recorded with who, when and what.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuditFilters action={action} from={from ?? ""} to={to ?? ""} prefixes={prefixes} />
        {rows.length === 0 ? (
          <EmptyState title="No entries match">Try a wider date range or clear the action filter.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.createdAt.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="font-medium">{r.userName ?? "system"}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono text-[11px]">{r.action}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.entity ? `${r.entity}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}` : "—"}</TableCell>
                  <TableCell className="max-w-md truncate text-xs" title={r.detail ?? undefined}>{r.detail ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {pages > 1 ? (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} nativeButton={false} render={<Link href={qs(page - 1)} />}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= pages} nativeButton={false} render={<Link href={qs(page + 1)} />}>Next</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
