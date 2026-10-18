"use client";

import { useMemo, useState, useTransition } from "react";
import { Activity, BellOff, Check, CheckCheck, Clock, Loader2, PackageSearch, RefreshCw, ScanSearch, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { markAlertRead, markAllRead, refreshAlerts, runAnomalyScan } from "@/actions/alerts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type AlertRow = {
  id: string;
  type: string;
  severity: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

const TYPE_META: Record<string, { label: string; icon: typeof Activity }> = {
  anomaly: { label: "Unusual sales", icon: Activity },
  low_stock: { label: "Low stock", icon: PackageSearch },
  expiry: { label: "Expiry", icon: Clock },
  shortage: { label: "Shortage", icon: TriangleAlert },
  plan_pending: { label: "Plan pending", icon: Clock },
};

const SEVERITY_CLASS: Record<string, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-primary/40 bg-primary/10 text-primary/80",
  info: "border-border bg-muted text-muted-foreground",
};

export function AlertsPanel({ outletId, alerts, canScan }: { outletId: string; alerts: AlertRow[]; canScan: boolean }) {
  const [tab, setTab] = useState("unread");
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const types = useMemo(() => [...new Set(alerts.map((a) => a.type))], [alerts]);
  const unread = alerts.filter((a) => !a.isRead).length;
  const visible = alerts.filter((a) => (tab === "all" ? true : tab === "unread" ? !a.isRead : a.type === tab));

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, done: (d: unknown) => string) {
    setBusy(label);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (r.ok) toast.success(done(r.data));
      else toast.error(r.error ?? "Failed");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList>
            <TabsTrigger value="unread">Unread {unread ? <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">{unread}</Badge> : null}</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
            {types.map((t) => (
              <TabsTrigger key={t} value={t}>{TYPE_META[t]?.label ?? t}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={tab} />
        </Tabs>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run("refresh", () => refreshAlerts(outletId), (d) => `${(d as { created: number }).created} new stock & plan alerts`)}>
            {busy === "refresh" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />} Refresh stock &amp; plan alerts
          </Button>
          {canScan ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run("scan", () => runAnomalyScan(outletId, 14), (d) => { const x = d as { flagged: number; created: number }; return `${x.flagged} unusual days, ${x.created} new alerts`; })}>
              {busy === "scan" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ScanSearch data-icon="inline-start" />} Scan sales for anomalies
            </Button>
          ) : null}
          <Button size="sm" disabled={pending || unread === 0} onClick={() => run("all", () => markAllRead(outletId), () => "All alerts marked read")}>
            <CheckCheck data-icon="inline-start" /> Mark all read
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><BellOff /></EmptyMedia>
            <EmptyTitle>{tab === "unread" ? "You're all caught up" : "No alerts here"}</EmptyTitle>
            <EmptyDescription>Alerts appear for low stock, expiring batches, forecast shortages, pending plans and unusual sales days.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((a) => {
            const meta = TYPE_META[a.type] ?? { label: a.type, icon: Activity };
            const Icon = meta.icon;
            return (
              <li key={a.id}>
                <Card size="sm" className={cn("gap-0", a.isRead && "opacity-70")}>
                  <CardContent className="flex items-start gap-3">
                    <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border", SEVERITY_CLASS[a.severity] ?? SEVERITY_CLASS.info)}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{meta.label}</Badge>
                        <Badge variant={a.severity === "critical" ? "destructive" : "secondary"} className="capitalize">{a.severity}</Badge>
                        <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString("en-IN")}</span>
                      </div>
                      <p className="mt-1 text-sm">{a.message}</p>
                    </div>
                    {!a.isRead ? (
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(a.id, () => markAlertRead(outletId, a.id), () => "Marked read")}>
                        <Check data-icon="inline-start" /> Read
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
