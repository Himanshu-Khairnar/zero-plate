"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Filter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export function AuditFilters({ action, from, to, prefixes }: { action: string; from: string; to: string; prefixes: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState({ action, from, to });
  const [pending, start] = useTransition();

  function apply(next = f) {
    const sp = new URLSearchParams();
    if (next.action) sp.set("action", next.action);
    if (next.from) sp.set("from", next.from);
    if (next.to) sp.set("to", next.to);
    start(() => router.push(`${pathname}?${sp.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <Field className="w-48">
        <FieldLabel htmlFor="audit-action" className="text-xs">Action</FieldLabel>
        <NativeSelect id="audit-action" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} className="h-8">
          <NativeSelectOption value="">All actions</NativeSelectOption>
          {prefixes.map((p) => <NativeSelectOption key={p} value={p}>{p}.*</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <Field className="w-40">
        <FieldLabel htmlFor="audit-from" className="text-xs">From</FieldLabel>
        <Input id="audit-from" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="h-8" />
      </Field>
      <Field className="w-40">
        <FieldLabel htmlFor="audit-to" className="text-xs">To</FieldLabel>
        <Input id="audit-to" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="h-8" />
      </Field>
      <Button size="sm" onClick={() => apply()}><Filter data-icon="inline-start" /> Filter</Button>
      {action || from || to ? (
        <Button size="sm" variant="ghost" onClick={() => { const n = { action: "", from: "", to: "" }; setF(n); apply(n); }}>
          <X data-icon="inline-start" /> Clear
        </Button>
      ) : null}
    </div>
  );
}
