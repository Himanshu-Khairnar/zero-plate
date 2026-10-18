"use client";

import { useState, useTransition } from "react";
import { ClipboardList, Loader2, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { createSuggestedOrders, editPurchaseOrderItems, updatePurchaseOrderStatus } from "@/actions/inventory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { inr, qtyWithUnit } from "@/lib/format";
import type { IngredientOption } from "@/components/inventory/inventory-manager";

export type PurchaseOrderView = {
  id: string;
  status: "SUGGESTED" | "ORDERED" | "RECEIVED" | "CANCELLED";
  supplierName: string | null;
  leadTimeDays: number | null;
  expectedDate: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  receivedAt: string | null;
  items: { ingredientId: string; name: string; unit: string; qty: number; unitPrice: number }[];
};

const STATUS_META: Record<PurchaseOrderView["status"], { label: string; className: string }> = {
  SUGGESTED: { label: "Suggested", className: "border-primary/30 bg-primary/10 text-primary" },
  ORDERED: { label: "Ordered", className: "border-primary/30 bg-primary/10 text-primary/80" },
  RECEIVED: { label: "Received", className: "border-primary/30 bg-primary/10 text-primary" },
  CANCELLED: { label: "Cancelled", className: "text-muted-foreground" },
};

const GROUPS: PurchaseOrderView["status"][] = ["SUGGESTED", "ORDERED", "RECEIVED", "CANCELLED"];

export function OrdersTab({ outletId, orders, ingredients, canEdit }: { outletId: string; orders: PurchaseOrderView[]; ingredients: IngredientOption[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<PurchaseOrderView | null>(null);
  const [pending, start] = useTransition();

  function suggest() {
    start(async () => {
      const r = await createSuggestedOrders(outletId);
      if (r.ok) toast.success(r.data?.orders ? `${r.data.orders} order${r.data.orders === 1 ? "" : "s"} suggested` : "Stock covers the forecast; nothing to order");
      else toast.error(r.error);
    });
  }

  function setStatus(po: PurchaseOrderView, status: "ORDERED" | "RECEIVED" | "CANCELLED") {
    start(async () => {
      const r = await updatePurchaseOrderStatus({ outletId, purchaseOrderId: po.id, status });
      if (r.ok) toast.success(status === "RECEIVED" ? "Received; stock updated" : status === "ORDERED" ? "Marked as ordered" : "Order cancelled");
      else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Purchase orders</CardTitle>
          <CardDescription>Suggested orders cover forecast demand over each supplier&apos;s lead time plus one day, minus stock on hand. Receiving an order books the stock in with expiry dates.</CardDescription>
          {canEdit ? (
            <Button size="sm" onClick={suggest} disabled={pending} className="sm:absolute sm:top-5 sm:right-5">
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />} Suggest orders from forecast
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
                <EmptyTitle>No purchase orders</EmptyTitle>
                <EmptyDescription>Use &ldquo;Suggest orders from forecast&rdquo; to draft what needs buying.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-6">
              {GROUPS.map((status) => {
                const list = orders.filter((o) => o.status === status);
                if (!list.length) return null;
                const meta = STATUS_META[status];
                return (
                  <section key={status} className="flex flex-col gap-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                      <span className="text-muted-foreground">{list.length}</span>
                    </h3>
                    {list.map((po) => {
                      const total = po.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
                      return (
                        <Card key={po.id} size="sm" className="gap-2">
                          <CardHeader>
                            <CardTitle className="flex flex-wrap items-center gap-2">
                              {po.supplierName ?? "No supplier"}
                              <span className="font-normal text-muted-foreground">#{po.id.slice(-6)}</span>
                            </CardTitle>
                            <CardDescription>
                              {po.expectedDate ? `Expected ${formatDate(po.expectedDate)}` : "No expected date"}
                              {po.leadTimeDays != null ? ` · ${po.leadTimeDays}d lead` : ""}
                              {po.note ? ` · ${po.note}` : ""}
                              {po.receivedAt ? ` · received ${new Date(po.receivedAt).toLocaleString("en-IN")}` : ""}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-3">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Ingredient</TableHead>
                                  <TableHead className="text-right">Qty</TableHead>
                                  <TableHead className="text-right">Unit price</TableHead>
                                  <TableHead className="text-right">Line</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {po.items.map((i) => (
                                  <TableRow key={i.ingredientId}>
                                    <TableCell className="font-medium">{i.name}</TableCell>
                                    <TableCell className="text-right tabular-nums">{qtyWithUnit(i.qty, i.unit)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">{inr(i.unitPrice)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{inr(i.qty * i.unitPrice)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                              <TableFooter>
                                <TableRow>
                                  <TableCell colSpan={3} className="font-medium">Total</TableCell>
                                  <TableCell className="text-right font-semibold tabular-nums">{inr(total)}</TableCell>
                                </TableRow>
                              </TableFooter>
                            </Table>
                            {canEdit && (status === "SUGGESTED" || status === "ORDERED") ? (
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setEditing(po)}><Pencil data-icon="inline-start" /> Edit lines</Button>
                                <Button variant="outline" size="sm" disabled={pending} onClick={() => setStatus(po, "CANCELLED")}>Cancel order</Button>
                                {status === "SUGGESTED" ? <Button size="sm" disabled={pending} onClick={() => setStatus(po, "ORDERED")}>Mark ordered</Button> : null}
                                {status === "ORDERED" ? <Button size="sm" disabled={pending} onClick={() => setStatus(po, "RECEIVED")}>Mark received</Button> : null}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {editing ? <EditLinesDialog outletId={outletId} po={editing} ingredients={ingredients} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function EditLinesDialog({ outletId, po, ingredients, onClose }: { outletId: string; po: PurchaseOrderView; ingredients: IngredientOption[]; onClose: () => void }) {
  const [lines, setLines] = useState<Record<string, { qty: number; unitPrice: number }>>(() => Object.fromEntries(po.items.map((i) => [i.ingredientId, { qty: i.qty, unitPrice: i.unitPrice }])));
  const [pending, start] = useTransition();
  const total = Object.values(lines).reduce((s, l) => s + l.qty * l.unitPrice, 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit order #{po.id.slice(-6)}</DialogTitle>
          <DialogDescription>Set a quantity to 0 to drop a line. Add any ingredient below.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingredient</TableHead>
                <TableHead className="w-28 text-right">Qty</TableHead>
                <TableHead className="w-28 text-right">Unit price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ingredients.map((i) => {
                const l = lines[i.id];
                return (
                  <TableRow key={i.id} className={l?.qty ? undefined : "opacity-70"}>
                    <TableCell className="font-medium">{i.name} <span className="text-xs text-muted-foreground">/{i.unit}</span></TableCell>
                    <TableCell className="text-right">
                      <Input type="number" min={0} step={i.unit === "pcs" ? 1 : 0.5} value={l?.qty ?? ""} placeholder="0" onChange={(e) => setLines({ ...lines, [i.id]: { qty: Number(e.target.value), unitPrice: l?.unitPrice ?? i.costPerUnit } })} className="ml-auto h-8 w-24 text-right tabular-nums" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" min={0} step="0.5" value={l?.unitPrice ?? i.costPerUnit} onChange={(e) => setLines({ ...lines, [i.id]: { qty: l?.qty ?? 0, unitPrice: Number(e.target.value) } })} className="ml-auto h-8 w-24 text-right tabular-nums" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-right text-sm">Total <strong className="tabular-nums">{inr(total)}</strong></p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await editPurchaseOrderItems({ outletId, purchaseOrderId: po.id, items: Object.entries(lines).map(([ingredientId, l]) => ({ ingredientId, qty: l.qty, unitPrice: l.unitPrice })) });
                if (r.ok) { toast.success("Order updated"); onClose(); } else toast.error(r.error);
              })
            }
          >
            Save lines
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
