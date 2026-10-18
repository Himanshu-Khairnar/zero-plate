"use client";

import { useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpFromLine, PackageOpen } from "lucide-react";
import { toast } from "sonner";

import { recordStockMovement } from "@/actions/inventory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { addDays, formatDate, today } from "@/lib/dates";
import { inr, qtyWithUnit } from "@/lib/format";

export type StockRowView = {
  ingredientId: string;
  name: string;
  unit: string;
  costPerUnit: number;
  shelfLifeDays: number;
  onHand: number;
  dailyUsage: number;
  daysOfCover: number | null;
  leadTimeDays: number;
  reorderPoint: number;
  needLead: number;
  status: "OK" | "LOW" | "OUT";
  nextExpiry: string | null;
  expiryState: "ok" | "soon" | "expired" | null;
  batches: { date: string | null; expiryDate: string; remaining: number }[];
  cheapestSupplier: { id: string; name: string; price: number; leadTimeDays: number } | null;
};

const STATUS_BADGE: Record<StockRowView["status"], { label: string; className: string }> = {
  OK: { label: "OK", className: "border-primary/30 bg-primary/10 text-primary" },
  LOW: { label: "Low", className: "border-primary/30 bg-primary/10 text-primary/80" },
  OUT: { label: "Out", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

export function StockTab({ outletId, rows, canEdit }: { outletId: string; rows: StockRowView[]; canEdit: boolean }) {
  const [dialog, setDialog] = useState<{ row: StockRowView; type: "IN" | "OUT" } | null>(null);
  const ordered = [...rows].sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock on hand</CardTitle>
        <CardDescription>Stock in minus stock out. Days of cover uses the last 14 days of sales; reorder status compares stock with forecast need over the supplier lead time.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon"><PackageOpen /></EmptyMedia>
              <EmptyTitle>No ingredients yet</EmptyTitle>
              <EmptyDescription>Add ingredients on the Menu &amp; Recipes page; stock is tracked per ingredient.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingredient</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Cover</TableHead>
                <TableHead className="text-right">Need (lead)</TableHead>
                <TableHead>Next expiry</TableHead>
                <TableHead>Status</TableHead>
                {canEdit ? <TableHead className="w-28" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((r) => {
                const badge = STATUS_BADGE[r.status];
                return (
                  <TableRow key={r.ingredientId} className={r.status === "OUT" ? "bg-destructive/5" : r.expiryState === "soon" || r.expiryState === "expired" ? "bg-primary/5" : undefined}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {inr(r.costPerUnit)}/{r.unit}
                        {r.cheapestSupplier ? ` · ${r.cheapestSupplier.name}, ${r.cheapestSupplier.leadTimeDays}d lead` : " · no supplier"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Tooltip>
                        <TooltipTrigger render={<span className="font-medium" />}>{qtyWithUnit(r.onHand, r.unit)}</TooltipTrigger>
                        <TooltipContent>
                          {r.batches.length ? (
                            <ul className="text-xs">
                              {r.batches.map((b, i) => (
                                <li key={i}>{qtyWithUnit(b.remaining, r.unit)} · expires {formatDate(b.expiryDate)}</li>
                              ))}
                            </ul>
                          ) : (
                            "No open batches with an expiry date"
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.daysOfCover == null ? "—" : r.daysOfCover >= 30 ? "30+ d" : `${r.daysOfCover} d`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{qtyWithUnit(r.needLead, r.unit)}</TableCell>
                    <TableCell>
                      {r.nextExpiry ? (
                        <span className="flex items-center gap-2 text-sm">
                          {formatDate(r.nextExpiry)}
                          {r.expiryState === "expired" ? <Badge variant="destructive">Expired</Badge> : null}
                          {r.expiryState === "soon" ? <Badge className="border-primary/30 bg-primary/10 text-primary/80" variant="outline">Use first</Badge> : null}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                    </TableCell>
                    {canEdit ? (
                      <TableCell className="text-right whitespace-nowrap">
                        <Tooltip>
                          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Stock in ${r.name}`} onClick={() => setDialog({ row: r, type: "IN" })} />}>
                            <ArrowDownToLine />
                          </TooltipTrigger>
                          <TooltipContent>Stock in</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Stock out ${r.name}`} onClick={() => setDialog({ row: r, type: "OUT" })} />}>
                            <ArrowUpFromLine />
                          </TooltipTrigger>
                          <TooltipContent>Stock out</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {dialog ? <MovementDialog outletId={outletId} row={dialog.row} type={dialog.type} onClose={() => setDialog(null)} /> : null}
    </Card>
  );
}

function rank(r: StockRowView): number {
  return (r.status === "OUT" ? 4 : r.status === "LOW" ? 2 : 0) + (r.expiryState === "expired" ? 3 : r.expiryState === "soon" ? 1 : 0);
}

function MovementDialog({ outletId, row, type, onClose }: { outletId: string; row: StockRowView; type: "IN" | "OUT"; onClose: () => void }) {
  const [qty, setQty] = useState<number>(0);
  const [reason, setReason] = useState<string>(type === "IN" ? "purchase" : "usage");
  const [expiry, setExpiry] = useState(addDays(today(), row.shelfLifeDays));
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const isIn = type === "IN";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isIn ? "Stock in" : "Stock out"} · {row.name}</DialogTitle>
          <DialogDescription>On hand now: {qtyWithUnit(row.onHand, row.unit)}. {isIn ? "New batches get an expiry date for use-first ordering." : "Record usage, waste, expiry or a count correction."}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="mv-qty">Quantity ({row.unit})</FieldLabel>
              <Input id="mv-qty" type="number" min={0} step={row.unit === "pcs" ? 1 : 0.1} value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} autoFocus />
            </Field>
            <Field>
              <FieldLabel htmlFor="mv-reason">Reason</FieldLabel>
              <NativeSelect id="mv-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {isIn ? (
                  <>
                    <NativeSelectOption value="purchase">Purchase</NativeSelectOption>
                    <NativeSelectOption value="adjustment">Count correction</NativeSelectOption>
                  </>
                ) : (
                  <>
                    <NativeSelectOption value="usage">Usage</NativeSelectOption>
                    <NativeSelectOption value="waste">Waste</NativeSelectOption>
                    <NativeSelectOption value="expired">Expired</NativeSelectOption>
                    <NativeSelectOption value="adjustment">Count correction</NativeSelectOption>
                  </>
                )}
              </NativeSelect>
            </Field>
          </div>
          {isIn ? (
            <Field>
              <FieldLabel htmlFor="mv-exp">Expiry date</FieldLabel>
              <Input id="mv-exp" type="date" min={today()} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="mv-note">Note (optional)</FieldLabel>
            <Input id="mv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={isIn ? "Invoice no., supplier…" : "What happened?"} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !(qty > 0)}
            onClick={() =>
              start(async () => {
                const r = await recordStockMovement({ outletId, ingredientId: row.ingredientId, type, reason: reason as "purchase" | "usage" | "waste" | "expired" | "adjustment", qty, expiryDate: isIn ? expiry : "", note });
                if (r.ok) { toast.success(`${isIn ? "Added" : "Removed"} ${qtyWithUnit(qty, row.unit)} of ${row.name}`); onClose(); } else toast.error(r.error);
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
