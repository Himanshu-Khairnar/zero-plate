"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, MapPin, Pencil, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { renameOrganization, upsertOutlet } from "@/actions/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type SettingsOutlet = { id: string; name: string; city: string; latitude: number | null; longitude: number | null; timezone: string; dishes: number; users: number };

export function OrganizationCard({ name, plan }: { name: string; plan: string }) {
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organisation</CardTitle>
        <CardDescription>The name shown to your team. Plans are managed by the Zero Plate platform team.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <Field className="min-w-0">
          <FieldLabel htmlFor="org-name">Name</FieldLabel>
          <Input id="org-name" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Plan</FieldLabel>
          <div className="h-8 flex items-center"><Badge>{plan}</Badge></div>
        </Field>
        <Button disabled={pending || value.trim() === name || value.trim().length < 2} onClick={() => start(async () => {
          const r = await renameOrganization(value);
          if (r.ok) toast.success("Organisation renamed"); else toast.error(r.error);
        })}>
          <Save data-icon="inline-start" /> Save
        </Button>
      </CardContent>
    </Card>
  );
}

export function OutletsCard({ outlets }: { outlets: SettingsOutlet[] }) {
  const [editing, setEditing] = useState<SettingsOutlet | "new" | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Outlets</CardTitle>
        <CardDescription>Coordinates and timezone matter: the forecasting service fetches each outlet&apos;s weather and holidays from them.</CardDescription>
        <Button size="sm" onClick={() => setEditing("new")} className="sm:absolute sm:top-5 sm:right-5">
          <Plus data-icon="inline-start" /> Add outlet
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Outlet</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead className="text-right">Dishes</TableHead>
              <TableHead className="text-right">Staff</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {outlets.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.name}</TableCell>
                <TableCell>{o.city}</TableCell>
                <TableCell>
                  {o.latitude != null && o.longitude != null ? (
                    <span className="inline-flex items-center gap-1 text-sm tabular-nums"><MapPin className="size-3.5 text-muted-foreground" /> {o.latitude.toFixed(4)}, {o.longitude.toFixed(4)}</span>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger render={<Badge variant="destructive" />}>no coordinates</TooltipTrigger>
                      <TooltipContent>Weather falls back to a Mumbai climatology until you set them.</TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{o.timezone}</TableCell>
                <TableCell className="text-right tabular-nums">{o.dishes}</TableCell>
                <TableCell className="text-right tabular-nums">{o.users}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon-sm" aria-label={`Edit ${o.name}`} onClick={() => setEditing(o)}><Pencil /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {editing ? <OutletDialog outlet={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}

function OutletDialog({ outlet, onClose }: { outlet: SettingsOutlet | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: outlet?.name ?? "",
    city: outlet?.city ?? "",
    latitude: outlet?.latitude?.toString() ?? "",
    longitude: outlet?.longitude?.toString() ?? "",
    timezone: outlet?.timezone ?? "Asia/Kolkata",
  });
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{outlet ? `Edit ${outlet.name}` : "Add outlet"}</DialogTitle>
          <DialogDescription>Find coordinates by right-clicking the location in Google Maps.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel htmlFor="o-name">Name</FieldLabel><Input id="o-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field><FieldLabel htmlFor="o-city">City</FieldLabel><Input id="o-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel htmlFor="o-lat">Latitude</FieldLabel><Input id="o-lat" type="number" step="0.0001" min={-90} max={90} value={form.latitude} placeholder="19.0760" onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="o-lon">Longitude</FieldLabel><Input id="o-lon" type="number" step="0.0001" min={-180} max={180} value={form.longitude} placeholder="72.8777" onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></Field>
          </div>
          <Field>
            <FieldLabel htmlFor="o-tz">Timezone</FieldLabel>
            <Input id="o-tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
            <FieldDescription>IANA name, for example Asia/Kolkata.</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || form.name.trim().length < 2 || !form.city.trim()} onClick={() => start(async () => {
            const r = await upsertOutlet({
              id: outlet?.id,
              name: form.name,
              city: form.city,
              latitude: form.latitude === "" ? null : Number(form.latitude),
              longitude: form.longitude === "" ? null : Number(form.longitude),
              timezone: form.timezone,
            });
            if (r.ok) { toast.success(outlet ? "Outlet updated" : "Outlet added"); onClose(); } else toast.error(r.error);
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PosKeyCard({ maskedKey, configured }: { maskedKey: string; configured: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>POS integration key</CardTitle>
        <CardDescription>Your POS sends sales to <code>POST /api/pos/sales</code> with this key in the <code>x-pos-key</code> header. See Sales Import → POS API for the payload.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {configured ? (
          <div className="flex items-center gap-2">
            <code className="rounded-lg bg-muted px-3 py-1.5 text-sm">{show ? maskedKey : maskedKey.replace(/[^•]/g, "•")}</code>
            <Button variant="ghost" size="icon-sm" aria-label={show ? "Hide key" : "Show key"} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</Button>
          </div>
        ) : (
          <Badge variant="outline">not configured</Badge>
        )}
        <p className="text-xs text-muted-foreground">
          The key lives in the server environment as <code>POS_API_KEY</code> (frontend/.env locally, project settings on Vercel). Only the last four characters are ever shown here.
        </p>
      </CardContent>
    </Card>
  );
}
