"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Camera, ChefHat, Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteWasteLog, logLeftoversFromKitchen, logWaste } from "@/actions/waste";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Stat } from "@/components/page-header";
import { formatDate, today } from "@/lib/dates";
import { inr, num, qtyWithUnit } from "@/lib/format";
import { WASTE_REASON_HINT, WASTE_REASON_LABEL, WASTE_REASONS, type WasteReason } from "@/lib/waste";
import { cn } from "@/lib/utils";

export type WasteRow = {
  id: string;
  date: string;
  qty: number;
  reason: WasteReason;
  note: string | null;
  photoUrl: string | null;
  aiLabel: string | null;
  aiConfidence: number | null;
  loggedBy: string | null;
  createdAt: string;
  dish: { id: string; name: string; costPerPlate: number } | null;
  ingredient: { id: string; name: string; unit: string; costPerUnit: number } | null;
};
export type WasteDish = { id: string; name: string; costPerPlate: number };
export type WasteIngredient = { id: string; name: string; unit: string; costPerUnit: number };

const REASON_TONE: Record<WasteReason, string> = {
  overproduction: "bg-primary/10 text-primary/80 border-primary/30",
  spoilage: "bg-foreground/10 text-foreground border-foreground/30",
  plate_waste: "bg-primary/10 text-primary border-primary/30",
  prep_loss: "bg-primary/10 text-primary border-primary/30",
};

const REASON_BAR: Record<WasteReason, string> = {
  overproduction: "bg-primary/70",
  spoilage: "bg-foreground",
  plate_waste: "bg-primary",
  prep_loss: "bg-primary",
};

export function ReasonBadge({ reason }: { reason: WasteReason }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="outline" className={cn("capitalize", REASON_TONE[reason])} />}>{WASTE_REASON_LABEL[reason]}</TooltipTrigger>
      <TooltipContent>{WASTE_REASON_HINT[reason]}</TooltipContent>
    </Tooltip>
  );
}

export function costOf(row: Pick<WasteRow, "qty" | "dish" | "ingredient">): number {
  if (row.dish) return row.qty * row.dish.costPerPlate;
  if (row.ingredient) return row.qty * row.ingredient.costPerUnit;
  return 0;
}

export function WasteLog({ outletId, rows, dishes, ingredients, days, canDelete }: { outletId: string; rows: WasteRow[]; dishes: WasteDish[]; ingredients: WasteIngredient[]; days: 7 | 30; canDelete: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const kpis = useMemo(() => {
    const plates = rows.filter((r) => r.dish).reduce((s, r) => s + r.qty, 0);
    const cost = rows.reduce((s, r) => s + costOf(r), 0);
    const byReason = Object.fromEntries(WASTE_REASONS.map((k) => [k, 0])) as Record<WasteReason, number>;
    for (const r of rows) byReason[r.reason] += costOf(r);
    const top = Object.entries(byReason).sort((a, b) => b[1] - a[1])[0];
    return { plates, cost, byReason, top };
  }, [rows]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`Plates wasted · ${days} days`} value={num(kpis.plates)} hint={`${num(kpis.plates / days, 1)} per day`} icon={<ChefHat />} />
        <Stat label="Cost of waste" value={inr(kpis.cost)} hint="at ingredient cost" tone={kpis.cost > 0 ? "bad" : "muted"} icon={<Receipt />} />
        <Stat label="Biggest reason" value={kpis.top ? WASTE_REASON_LABEL[kpis.top[0] as WasteReason] : "—"} hint={kpis.top && kpis.cost ? `${num((kpis.top[1] / kpis.cost) * 100)}% of cost` : undefined} />
        <Card size="sm" className="gap-0">
          <CardContent>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">By reason</p>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
              {WASTE_REASONS.map((k) => {
                const share = kpis.cost ? (kpis.byReason[k] / kpis.cost) * 100 : 0;
                return share > 0 ? <Tooltip key={k}><TooltipTrigger render={<span className={cn("h-full", REASON_BAR[k])} style={{ width: `${share}%` }} />} /><TooltipContent>{WASTE_REASON_LABEL[k]} · {inr(kpis.byReason[k])}</TooltipContent></Tooltip> : null;
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WASTE_REASONS.map((k) => <ReasonBadge key={k} reason={k} />)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Waste entries</CardTitle>
          <CardDescription>Everything logged by staff, the photo capture flow and kitchen-mode leftovers.</CardDescription>
          <div className="flex flex-wrap gap-2 sm:absolute sm:top-5 sm:right-5">
            <ToggleGroup value={[String(days)]} onValueChange={(v) => { const d = (v as string[])[0]; if (d) router.push(`?days=${d}`); }} variant="outline" size="sm">
              <ToggleGroupItem value="7">7 days</ToggleGroupItem>
              <ToggleGroupItem value="30">30 days</ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => {
              const r = await logLeftoversFromKitchen(outletId, today());
              if (r.ok) toast.success(r.data?.created ? `Logged leftovers for ${r.data.created} dishes` : "No new leftovers to log today");
              else toast.error(r.error);
            })}>
              <ChefHat data-icon="inline-start" /> Log today&apos;s leftovers
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}><Plus data-icon="inline-start" /> Log waste</Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Receipt /></EmptyMedia>
                <EmptyTitle>Nothing logged in this period</EmptyTitle>
                <EmptyDescription>Log waste by hand, photograph leftovers in kitchen mode, or pull today&apos;s leftovers from the kitchen board.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14" />
                  <TableHead>Item</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>When · who</TableHead>
                  {canDelete ? <TableHead className="w-12" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.photoUrl ? (
                        <a href={r.photoUrl} target="_blank" rel="noreferrer" className="block size-10 overflow-hidden rounded-md border">
                          <Image src={r.photoUrl} alt="" width={40} height={40} className="size-10 object-cover" unoptimized />
                        </a>
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground"><Camera className="size-4" /></span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.dish?.name ?? r.ingredient?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.dish ? "Dish" : "Ingredient"}
                        {r.aiLabel ? ` · AI suggested ${r.aiLabel}${r.aiConfidence != null ? ` (${Math.round(r.aiConfidence * 100)}%)` : ""}` : ""}
                        {r.note && r.note !== "auto:kitchen-leftover" ? ` · ${r.note}` : r.note === "auto:kitchen-leftover" ? " · from kitchen board" : ""}
                      </div>
                    </TableCell>
                    <TableCell><ReasonBadge reason={r.reason} /></TableCell>
                    <TableCell className="text-right tabular-nums">{r.dish ? `${num(r.qty)} plates` : qtyWithUnit(r.qty, r.ingredient?.unit ?? "")}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{inr(costOf(r))}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(r.date)} · {r.loggedBy ?? "—"}</TableCell>
                    {canDelete ? (
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" aria-label="Delete entry" disabled={pending} onClick={() => {
                          if (!window.confirm("Delete this waste entry?")) return;
                          start(async () => { const res = await deleteWasteLog(outletId, r.id); if (res.ok) toast.success("Deleted"); else toast.error(res.error); });
                        }}><Trash2 /></Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {open ? <LogWasteDialog outletId={outletId} dishes={dishes} ingredients={ingredients} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

export function LogWasteDialog({ outletId, dishes, ingredients, onClose, preset }: { outletId: string; dishes: WasteDish[]; ingredients: WasteIngredient[]; onClose: () => void; preset?: { dishId?: string; qty?: number; aiLabel?: string; aiConfidence?: number; photo?: File | null } }) {
  const [kind, setKind] = useState<"dish" | "ingredient">(preset?.dishId || !ingredients.length ? "dish" : "dish");
  const [dishId, setDishId] = useState(preset?.dishId ?? dishes[0]?.id ?? "");
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? "");
  const [qty, setQty] = useState<number>(preset?.qty ?? 1);
  const [reason, setReason] = useState<WasteReason>("overproduction");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(preset?.photo ?? null);
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const fd = new FormData();
      fd.set("outletId", outletId);
      fd.set("date", date);
      fd.set(kind === "dish" ? "dishId" : "ingredientId", kind === "dish" ? dishId : ingredientId);
      fd.set("qty", String(qty));
      fd.set("reason", reason);
      if (note) fd.set("note", note);
      if (preset?.aiLabel) fd.set("aiLabel", preset.aiLabel);
      if (preset?.aiConfidence != null) fd.set("aiConfidence", String(preset.aiConfidence));
      if (photo) fd.set("photo", photo);
      const r = await logWaste(fd);
      if (r.ok) { toast.success("Waste logged"); onClose(); } else toast.error(r.error);
    });
  }

  const unit = ingredients.find((i) => i.id === ingredientId)?.unit ?? "";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log waste</DialogTitle>
          <DialogDescription>Tag the reason so the heatmap and insights can tell overproduction from spoilage.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <RadioGroup value={kind} onValueChange={(v) => setKind(v as "dish" | "ingredient")} className="flex gap-6">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="dish" /> Dish (plates)</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="ingredient" /> Ingredient</label>
          </RadioGroup>
          <div className="grid grid-cols-3 gap-3">
            <Field className="col-span-2">
              <FieldLabel htmlFor="w-item">{kind === "dish" ? "Dish" : "Ingredient"}</FieldLabel>
              {kind === "dish" ? (
                <NativeSelect id="w-item" value={dishId} onChange={(e) => setDishId(e.target.value)}>
                  {dishes.map((d) => <NativeSelectOption key={d.id} value={d.id}>{d.name}</NativeSelectOption>)}
                </NativeSelect>
              ) : (
                <NativeSelect id="w-item" value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
                  {ingredients.map((i) => <NativeSelectOption key={i.id} value={i.id}>{i.name} ({i.unit})</NativeSelectOption>)}
                </NativeSelect>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="w-qty">Qty {kind === "dish" ? "(plates)" : unit ? `(${unit})` : ""}</FieldLabel>
              <Input id="w-qty" type="number" min={0} step={kind === "dish" || unit === "pcs" ? 1 : 0.1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </Field>
          </div>
          <Field>
            <FieldLabel>Reason</FieldLabel>
            <ToggleGroup value={[reason]} onValueChange={(v) => { const r = (v as string[])[0]; if (r) setReason(r as WasteReason); }} variant="outline" size="sm" className="flex-wrap justify-start gap-1.5" spacing={1}>
              {WASTE_REASONS.map((k) => <ToggleGroupItem key={k} value={k} className="rounded-full px-3">{WASTE_REASON_LABEL[k]}</ToggleGroupItem>)}
            </ToggleGroup>
            <FieldDescription>{WASTE_REASON_HINT[reason]}</FieldDescription>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel htmlFor="w-date">Day</FieldLabel><Input id="w-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="w-photo">Photo (optional)</FieldLabel><Input id="w-photo" type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></Field>
          </div>
          <Field><FieldLabel htmlFor="w-note">Note</FieldLabel><Textarea id="w-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. walk-in freezer door left open" /></Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || qty <= 0 || (kind === "dish" ? !dishId : !ingredientId)} onClick={submit}>Save entry</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
