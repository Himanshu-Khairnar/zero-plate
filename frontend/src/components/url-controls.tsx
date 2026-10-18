"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { OutletSummary } from "@/lib/outlets";

function useUrlParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      start(() => router.push(`${pathname}?${next.toString()}`));
    },
    [params, pathname, router],
  );
  return { set, pending };
}

export function OutletPicker({ outlets, value }: { outlets: OutletSummary[]; value: string | null }) {
  const { set } = useUrlParam();
  if (outlets.length <= 1) {
    return <div className="text-sm font-medium">{outlets[0]?.name ?? "No outlet"}</div>;
  }
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">Outlet</Label>
      <Select items={outlets.map((o) => ({ value: o.id, label: o.name }))} value={value ?? undefined} onValueChange={(v) => set("outlet", v ? String(v) : null)}>
        <SelectTrigger size="sm" className="min-w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {outlets.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DatePicker({ value, min, max, label = "Day" }: { value: string; min?: string; max?: string; label?: string }) {
  const { set, pending } = useUrlParam();
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && set("date", e.target.value)}
        className="h-8 w-40"
        aria-busy={pending}
      />
    </div>
  );
}

export function DishPicker({ dishes, value }: { dishes: { id: string; name: string }[]; value: string }) {
  const { set } = useUrlParam();
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">Dish</Label>
      <Select items={dishes.map((d) => ({ value: d.id, label: d.name }))} value={value} onValueChange={(v) => set("dish", v ? String(v) : null)}>
        <SelectTrigger size="sm" className="min-w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dishes.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
