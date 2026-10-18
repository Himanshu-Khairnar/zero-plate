"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Tags, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";

import { deleteSupplier, setSupplierPrice, upsertSupplier } from "@/actions/inventory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr } from "@/lib/format";
import type { IngredientOption } from "@/components/inventory/inventory-manager";

export type SupplierView = {
  id: string;
  name: string;
  contact: string | null;
  leadTimeDays: number;
  prices: { ingredientId: string; price: number }[];
  openOrders: number;
};

export function SuppliersTab({ outletId, suppliers, ingredients, canEdit }: { outletId: string; suppliers: SupplierView[]; ingredients: IngredientOption[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<SupplierView | "new" | null>(null);
  const [pricing, setPricing] = useState<SupplierView | null>(null);
  const [pending, start] = useTransition();
  const ingName = new Map(ingredients.map((i) => [i.id, i]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Suppliers</CardTitle>
        <CardDescription>Lead times decide how far ahead orders are placed; price lists decide who gets each order.</CardDescription>
        {canEdit ? (
          <Button size="sm" onClick={() => setEditing("new")} className="sm:absolute sm:top-5 sm:right-5">
            <Plus data-icon="inline-start" /> Add supplier
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {suppliers.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Truck /></EmptyMedia>
              <EmptyTitle>No suppliers yet</EmptyTitle>
              <EmptyDescription>Add the people you buy from, with their delivery lead time and prices.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {suppliers.map((s) => (
              <Card key={s.id} size="sm" className="gap-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="size-4 text-muted-foreground" /> {s.name}
                  </CardTitle>
                  <CardDescription>{s.contact || "No contact details"}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{s.leadTimeDays} day lead</Badge>
                    <Badge variant="outline">{s.prices.length} priced items</Badge>
                    {s.openOrders ? <Badge variant="outline">{s.openOrders} open order{s.openOrders === 1 ? "" : "s"}</Badge> : null}
                  </div>
                  {s.prices.length ? (
                    <ul className="max-h-28 overflow-y-auto text-xs text-muted-foreground">
                      {s.prices.slice(0, 6).map((p) => (
                        <li key={p.ingredientId} className="flex justify-between">
                          <span>{ingName.get(p.ingredientId)?.name ?? "—"}</span>
                          <span className="tabular-nums">{inr(p.price)}/{ingName.get(p.ingredientId)?.unit ?? ""}</span>
                        </li>
                      ))}
                      {s.prices.length > 6 ? <li>… {s.prices.length - 6} more</li> : null}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No price list yet.</p>
                  )}
                  {canEdit ? (
                    <div className="flex gap-1">
                      <Button variant="outline" size="xs" onClick={() => setPricing(s)}><Tags data-icon="inline-start" /> Prices</Button>
                      <Button variant="ghost" size="xs" onClick={() => setEditing(s)}><Pencil data-icon="inline-start" /> Edit</Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={pending}
                        onClick={() => {
                          if (!window.confirm(`Delete ${s.name}? Their price list is removed too.`)) return;
                          start(async () => {
                            const r = await deleteSupplier(outletId, s.id);
                            if (r.ok) toast.success("Supplier deleted"); else toast.error(r.error);
                          });
                        }}
                      >
                        <Trash2 data-icon="inline-start" /> Delete
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
      {editing ? <SupplierDialog outletId={outletId} supplier={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      {pricing ? <PriceDialog outletId={outletId} supplier={pricing} ingredients={ingredients} onClose={() => setPricing(null)} /> : null}
    </Card>
  );
}

function SupplierDialog({ outletId, supplier, onClose }: { outletId: string; supplier: SupplierView | null; onClose: () => void }) {
  const [form, setForm] = useState({ name: supplier?.name ?? "", contact: supplier?.contact ?? "", leadTimeDays: supplier?.leadTimeDays ?? 2 });
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit supplier" : "Add supplier"}</DialogTitle>
          <DialogDescription>Lead time is the days between placing an order and delivery.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="sup-name">Name</FieldLabel>
            <Input id="sup-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="sup-contact">Contact</FieldLabel>
            <Input id="sup-contact" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Phone, email or WhatsApp" />
          </Field>
          <Field>
            <FieldLabel htmlFor="sup-lead">Lead time (days)</FieldLabel>
            <Input id="sup-lead" type="number" min={0} max={60} value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: Number(e.target.value) })} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !form.name.trim()}
            onClick={() =>
              start(async () => {
                const r = await upsertSupplier({ ...form, id: supplier?.id, outletId });
                if (r.ok) { toast.success(supplier ? "Supplier updated" : "Supplier added"); onClose(); } else toast.error(r.error);
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

function PriceDialog({ outletId, supplier, ingredients, onClose }: { outletId: string; supplier: SupplierView; ingredients: IngredientOption[]; onClose: () => void }) {
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(supplier.prices.map((p) => [p.ingredientId, String(p.price)])));
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Price list · {supplier.name}</DialogTitle>
          <DialogDescription>Price per unit. Leave blank for ingredients this supplier does not carry. Reference cost shown for comparison.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingredient</TableHead>
                <TableHead className="text-right">Reference</TableHead>
                <TableHead className="w-36 text-right">Supplier price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ingredients.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.name} <span className="text-xs text-muted-foreground">/{i.unit}</span></TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{inr(i.costPerUnit)}</TableCell>
                  <TableCell className="text-right">
                    <Input type="number" min={0} step="0.5" value={prices[i.id] ?? ""} placeholder="—" onChange={(e) => setPrices({ ...prices, [i.id]: e.target.value })} className="ml-auto h-8 w-28 text-right tabular-nums" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await setSupplierPrice({ outletId, supplierId: supplier.id, prices: ingredients.map((i) => ({ ingredientId: i.id, price: prices[i.id] === "" || prices[i.id] == null ? null : Number(prices[i.id]) })) });
                if (r.ok) { toast.success("Price list saved"); onClose(); } else toast.error(r.error);
              })
            }
          >
            Save prices
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
