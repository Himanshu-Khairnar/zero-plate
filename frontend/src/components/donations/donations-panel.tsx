"use client";

import { useState, useTransition } from "react";
import { Building2, CheckCircle2, HeartHandshake, Pencil, Phone, Plus, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { createDonation, deleteDonation, updateDonationStatus, upsertNgo, type SurplusEstimate } from "@/actions/donations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Stat } from "@/components/page-header";
import { formatDate, today } from "@/lib/dates";
import { num } from "@/lib/format";

export type NgoRow = { id: string; name: string; city: string; contact: string | null; address: string | null; acceptsCooked: boolean; pickupNote: string | null };
export type DonationRow = { id: string; date: string; meals: number; dishNames: string | null; status: string; note: string | null; createdBy: string | null; ngo: { id: string; name: string } | null };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = { PLANNED: "secondary", COLLECTED: "default", CANCELLED: "outline" };

export function DonationsPanel({ outletId, city, surplus, ngos, donations, totals, canManageNgos }: {
  outletId: string;
  city: string;
  surplus: SurplusEstimate;
  ngos: NgoRow[];
  donations: DonationRow[];
  totals: { month: number; allTime: number; count: number };
  canManageNgos: boolean;
}) {
  const [donate, setDonate] = useState<null | { meals: number; dishNames: string }>(null);
  const [ngoDialog, setNgoDialog] = useState<NgoRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const nearby = ngos.filter((n) => n.city.toLowerCase() === city.toLowerCase());
  const cooked = nearby.filter((n) => n.acceptsCooked);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Meals donated · this month" value={num(totals.month)} icon={<HeartHandshake />} tone="good" />
        <Stat label="Meals donated · all time" value={num(totals.allTime)} hint={`${totals.count} donations`} />
        <Stat label="Likely surplus today" value={`${num(surplus.total)} plates`} hint={surplus.lines.length ? surplus.lines.slice(0, 3).map((l) => l.dishName).join(", ") : "nothing predicted yet"} tone={surplus.total > 0 ? "bad" : "muted"} />
      </div>

      <Card className={surplus.total > 0 ? "border-primary/40 bg-primary/5" : undefined}>
        <CardHeader>
          <CardTitle>Tonight&apos;s surplus</CardTitle>
          <CardDescription>
            {surplus.total > 0
              ? `You are likely to have about ${num(surplus.total)} plates left: ${surplus.lines.map((l) => `${l.dishName} (~${l.plates}${l.source === "kitchen" ? ", from the kitchen board" : ""})`).join(", ")}. ${cooked.length ? `${cooked.length} NGO${cooked.length === 1 ? "" : "s"} nearby accept cooked food.` : "Add a nearby NGO that accepts cooked food to arrange a pickup."}`
              : "No surplus is predicted for today. Suggestions come from the approved prep plan's cushion above expected demand and from leftovers logged in kitchen mode."}
          </CardDescription>
          {surplus.total > 0 ? (
            <Button size="sm" className="sm:absolute sm:top-5 sm:right-5" onClick={() => setDonate({ meals: surplus.total, dishNames: surplus.lines.map((l) => l.dishName).join(", ") })}>
              <HeartHandshake data-icon="inline-start" /> Arrange a donation
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="sm:absolute sm:top-5 sm:right-5" onClick={() => setDonate({ meals: 10, dishNames: "" })}>
              <Plus data-icon="inline-start" /> Log a donation
            </Button>
          )}
        </CardHeader>
        {cooked.length ? (
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cooked.map((n) => (
              <div key={n.id} className="rounded-lg border bg-background p-3 text-sm">
                <p className="font-medium">{n.name}</p>
                {n.contact ? <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="size-3" /> {n.contact}</p> : null}
                {n.pickupNote ? <p className="mt-1 text-xs text-muted-foreground">{n.pickupNote}</p> : null}
              </div>
            ))}
          </CardContent>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Donation log</CardTitle>
            <CardDescription>Planned pickups and what has been collected.</CardDescription>
          </CardHeader>
          <CardContent>
            {donations.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><HeartHandshake /></EmptyMedia>
                  <EmptyTitle>No donations yet</EmptyTitle>
                  <EmptyDescription>When surplus is predicted, arrange a pickup here. Every meal counts on the dashboard.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>NGO</TableHead>
                    <TableHead className="text-right">Meals</TableHead>
                    <TableHead>Dishes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {donations.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(d.date)}</TableCell>
                      <TableCell>{d.ngo?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{num(d.meals)}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={d.dishNames ?? undefined}>{d.dishNames ?? "—"}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[d.status] ?? "outline"}>{d.status.toLowerCase()}</Badge></TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {d.status === "PLANNED" ? (
                          <>
                            <Button variant="ghost" size="icon-sm" aria-label="Mark collected" disabled={pending} onClick={() => start(async () => { const r = await updateDonationStatus(outletId, d.id, "COLLECTED"); if (r.ok) toast.success("Marked collected"); else toast.error(r.error); })}><CheckCircle2 /></Button>
                            <Button variant="ghost" size="icon-sm" aria-label="Cancel" disabled={pending} onClick={() => start(async () => { const r = await updateDonationStatus(outletId, d.id, "CANCELLED"); if (r.ok) toast.success("Cancelled"); else toast.error(r.error); })}><XCircle /></Button>
                          </>
                        ) : null}
                        {canManageNgos ? (
                          <Button variant="ghost" size="icon-sm" aria-label="Delete" disabled={pending} onClick={() => { if (!window.confirm("Delete this donation?")) return; start(async () => { const r = await deleteDonation(outletId, d.id); if (r.ok) toast.success("Deleted"); else toast.error(r.error); }); }}><Trash2 /></Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>NGOs & food banks</CardTitle>
            <CardDescription>Directory for {city}. Shared across outlets.</CardDescription>
            {canManageNgos ? <Button variant="outline" size="sm" className="sm:absolute sm:top-5 sm:right-5" onClick={() => setNgoDialog("new")}><Plus data-icon="inline-start" /> Add</Button> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {nearby.length === 0 ? (
              <p className="text-sm text-muted-foreground">No NGOs listed for {city} yet.</p>
            ) : nearby.map((n) => (
              <div key={n.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{n.name}</p>
                    {n.address ? <p className="text-xs text-muted-foreground">{n.address}</p> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={n.acceptsCooked ? "secondary" : "outline"}>{n.acceptsCooked ? "cooked food" : "dry goods"}</Badge>
                    {canManageNgos ? <Button variant="ghost" size="icon-xs" aria-label="Edit" onClick={() => setNgoDialog(n)}><Pencil /></Button> : null}
                  </div>
                </div>
                {n.contact ? <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="size-3" /> {n.contact}</p> : null}
                {n.pickupNote ? <p className="mt-1 text-xs text-muted-foreground">{n.pickupNote}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {donate ? <DonationDialog outletId={outletId} ngos={cooked.length ? cooked : nearby} initial={donate} onClose={() => setDonate(null)} /> : null}
      {ngoDialog ? <NgoDialog city={city} ngo={ngoDialog === "new" ? null : ngoDialog} onClose={() => setNgoDialog(null)} /> : null}
    </div>
  );
}

function DonationDialog({ outletId, ngos, initial, onClose }: { outletId: string; ngos: NgoRow[]; initial: { meals: number; dishNames: string }; onClose: () => void }) {
  const [form, setForm] = useState({ ngoId: ngos[0]?.id ?? "", date: today(), meals: initial.meals, dishNames: initial.dishNames, note: "" });
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Arrange a donation</DialogTitle>
          <DialogDescription>Record the pickup so the meals count towards your impact.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="d-ngo">NGO</FieldLabel>
            <NativeSelect id="d-ngo" value={form.ngoId} onChange={(e) => setForm({ ...form, ngoId: e.target.value })}>
              <NativeSelectOption value="">Not decided yet</NativeSelectOption>
              {ngos.map((n) => <NativeSelectOption key={n.id} value={n.id}>{n.name}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel htmlFor="d-date">Day</FieldLabel><Input id="d-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="d-meals">Meals</FieldLabel><Input id="d-meals" type="number" min={1} value={form.meals} onChange={(e) => setForm({ ...form, meals: Number(e.target.value) })} /></Field>
          </div>
          <Field><FieldLabel htmlFor="d-dishes">Dishes</FieldLabel><Input id="d-dishes" value={form.dishNames} onChange={(e) => setForm({ ...form, dishNames: e.target.value })} placeholder="e.g. Veg Thali, Dal Khichdi" /></Field>
          <Field><FieldLabel htmlFor="d-note">Note</FieldLabel><Textarea id="d-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || form.meals <= 0} onClick={() => start(async () => {
            const r = await createDonation({ outletId, ngoId: form.ngoId || undefined, date: form.date, meals: form.meals, dishNames: form.dishNames || undefined, note: form.note || undefined });
            if (r.ok) { toast.success("Donation recorded"); onClose(); } else toast.error(r.error);
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NgoDialog({ city, ngo, onClose }: { city: string; ngo: NgoRow | null; onClose: () => void }) {
  const [form, setForm] = useState({ name: ngo?.name ?? "", city: ngo?.city ?? city, contact: ngo?.contact ?? "", address: ngo?.address ?? "", acceptsCooked: ngo?.acceptsCooked ?? true, pickupNote: ngo?.pickupNote ?? "" });
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="size-4" /> {ngo ? "Edit NGO" : "Add NGO"}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field><FieldLabel htmlFor="n-name">Name</FieldLabel><Input id="n-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel htmlFor="n-city">City</FieldLabel><Input id="n-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="n-contact">Contact</FieldLabel><Input id="n-contact" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="phone or email" /></Field>
          </div>
          <Field><FieldLabel htmlFor="n-addr">Address</FieldLabel><Input id="n-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field><FieldLabel htmlFor="n-note">Pickup note</FieldLabel><Textarea id="n-note" rows={2} value={form.pickupNote} onChange={(e) => setForm({ ...form, pickupNote: e.target.value })} placeholder="hours, packaging, who to call" /></Field>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.acceptsCooked} onCheckedChange={(v) => setForm({ ...form, acceptsCooked: Boolean(v) })} /> Accepts cooked food</label>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || form.name.trim().length < 2} onClick={() => start(async () => {
            const r = await upsertNgo({ ...form, id: ngo?.id, contact: form.contact || undefined, address: form.address || undefined, pickupNote: form.pickupNote || undefined });
            if (r.ok) { toast.success("Saved"); onClose(); } else toast.error(r.error);
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
