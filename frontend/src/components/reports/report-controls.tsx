"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { addDays, today } from "@/lib/dates";

export function PeriodPicker({ start, end, preset }: { start: string; end: string; preset: "week" | "month" | "custom" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [custom, setCustom] = useState({ start, end });
  const [pending, startTransition] = useTransition();

  function push(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <ToggleGroup
        value={[preset]}
        onValueChange={(v) => {
          const p = (Array.isArray(v) ? v[0] : v) as string | undefined;
          if (!p) return;
          if (p === "week") push({ start: addDays(today(), -7), end: addDays(today(), -1) });
          else if (p === "month") push({ start: addDays(today(), -30), end: addDays(today(), -1) });
        }}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="week">Last 7 days</ToggleGroupItem>
        <ToggleGroupItem value="month">Last 30 days</ToggleGroupItem>
        <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
      </ToggleGroup>
      <Field className="w-40">
        <FieldLabel htmlFor="rep-start" className="text-xs">From</FieldLabel>
        <Input id="rep-start" type="date" value={custom.start} max={custom.end} onChange={(e) => setCustom({ ...custom, start: e.target.value })} className="h-8" />
      </Field>
      <Field className="w-40">
        <FieldLabel htmlFor="rep-end" className="text-xs">To</FieldLabel>
        <Input id="rep-end" type="date" value={custom.end} min={custom.start} max={today()} onChange={(e) => setCustom({ ...custom, end: e.target.value })} className="h-8" />
      </Field>
      <Button variant="outline" size="sm" disabled={!custom.start || !custom.end || custom.start > custom.end} onClick={() => push({ start: custom.start, end: custom.end })}>
        Apply
      </Button>
    </div>
  );
}

export function DownloadButtons({ outletId, start, end }: { outletId: string; start: string; end: string }) {
  const href = (format: string) => `/api/reports?outletId=${encodeURIComponent(outletId)}&start=${start}&end=${end}&format=${format}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" nativeButton={false} render={<a href={href("xlsx")} />}>
        <FileSpreadsheet data-icon="inline-start" /> Excel
      </Button>
      <Button size="sm" variant="outline" nativeButton={false} render={<a href={href("pdf")} />}>
        <FileText data-icon="inline-start" /> PDF
      </Button>
      <Button size="sm" variant="outline" nativeButton={false} render={<a href={href("csv")} />}>
        <Download data-icon="inline-start" /> CSV
      </Button>
    </div>
  );
}
