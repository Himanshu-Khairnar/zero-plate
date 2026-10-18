"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Check, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { logWaste, recognizeWastePhoto, type VisionResult } from "@/actions/waste";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { today } from "@/lib/dates";
import { WASTE_REASON_LABEL, WASTE_REASONS, type WasteReason } from "@/lib/waste";
import { cn } from "@/lib/utils";

type Dish = { id: string; name: string };

type Line = { key: string; dishId: string; qty: number; aiLabel?: string; aiConfidence?: number; selected: boolean };

/**
 * Tablet-first flow for kitchen staff: photograph the tray → the service
 * suggests what it sees → staff tick what is right, fix quantities, pick a
 * reason → one tap saves every line with the photo attached.
 */
export function WasteCapture({ outletId, dishes }: { outletId: string; dishes: Dish[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<VisionResult | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [reason, setReason] = useState<WasteReason>("overproduction");
  const [recognizing, startRecognize] = useTransition();
  const [saving, startSave] = useTransition();
  const [savedCount, setSavedCount] = useState<number | null>(null);

  function reset() {
    setPhoto(null); setPreview(null); setResult(null); setLines([]); setSavedCount(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onPhoto(file: File) {
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setSavedCount(null);
    startRecognize(async () => {
      const fd = new FormData();
      fd.set("outletId", outletId);
      fd.set("photo", file);
      const r = await recognizeWastePhoto(fd);
      if (!r.ok) {
        toast.message(r.error);
        setLines([{ key: "manual-0", dishId: dishes[0]?.id ?? "", qty: 1, selected: true }]);
        return;
      }
      setResult(r.data);
      const suggested = r.data.items.map((it, i) => ({
        key: `ai-${i}`,
        dishId: it.dishId ?? dishes.find((d) => d.name === it.dishName)?.id ?? dishes[0]?.id ?? "",
        qty: Math.max(1, Math.round(it.estimatedQty)),
        aiLabel: it.label,
        aiConfidence: it.confidence,
        selected: i === 0,
      }));
      setLines(suggested.length ? suggested : [{ key: "manual-0", dishId: dishes[0]?.id ?? "", qty: 1, selected: true }]);
    });
  }

  function save() {
    const chosen = lines.filter((l) => l.selected && l.dishId && l.qty > 0);
    if (!chosen.length) { toast.error("Tick at least one item."); return; }
    startSave(async () => {
      let ok = 0;
      for (const [i, l] of chosen.entries()) {
        const fd = new FormData();
        fd.set("outletId", outletId);
        fd.set("date", today());
        fd.set("dishId", l.dishId);
        fd.set("qty", String(l.qty));
        fd.set("reason", reason);
        if (l.aiLabel) fd.set("aiLabel", l.aiLabel);
        if (l.aiConfidence != null) fd.set("aiConfidence", String(l.aiConfidence));
        if (photo && i === 0) fd.set("photo", photo); // one copy of the photo is enough
        const r = await logWaste(fd);
        if (r.ok) ok++; else toast.error(r.error);
      }
      if (ok) { toast.success(`${ok} waste ${ok === 1 ? "entry" : "entries"} saved`); setSavedCount(ok); }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>1 · Photograph the leftovers</CardTitle>
          <CardDescription>Trays, bain-marie or the waste bin. One photo per round is fine.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="sr-only" id="waste-photo" onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Leftovers" className="aspect-[4/3] w-full rounded-lg border object-cover" />
          ) : (
            <label htmlFor="waste-photo" className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed text-center transition-colors hover:bg-muted/50">
              <Camera className="size-10 text-muted-foreground" />
              <span className="text-base font-semibold">Tap to take a photo</span>
              <span className="text-sm text-muted-foreground">or choose one from the gallery</span>
            </label>
          )}
          <div className="flex gap-2">
            <Button size="lg" className="flex-1" onClick={() => inputRef.current?.click()} disabled={recognizing}>
              <Camera data-icon="inline-start" /> {preview ? "Retake" : "Take photo"}
            </Button>
            {preview ? <Button size="lg" variant="outline" onClick={reset}><RotateCcw data-icon="inline-start" /> Start over</Button> : null}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>2 · Confirm what was wasted</CardTitle>
          <CardDescription>
            {recognizing ? "Looking at the photo…" : result ? `Suggestions from ${result.model}. Tick the right ones and fix the plate counts.` : "Suggestions appear here after the photo; you can also add lines by hand."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {recognizing ? (
            <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Recognising items…</div>
          ) : null}
          {result ? (
            <Alert>
              <Sparkles />
              <AlertTitle>How this works</AlertTitle>
              <AlertDescription>{result.note}</AlertDescription>
            </Alert>
          ) : null}

          {lines.length ? (
            <div className="flex flex-col gap-2">
              {lines.map((l, idx) => (
                <div key={l.key} className={cn("flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors", l.selected ? "border-primary bg-primary/5" : "opacity-70")}>
                  <Button variant={l.selected ? "default" : "outline"} size="icon-lg" aria-label={l.selected ? "Selected" : "Select"} onClick={() => setLines(lines.map((x, i) => (i === idx ? { ...x, selected: !x.selected } : x)))}>
                    <Check />
                  </Button>
                  <Field className="min-w-44 flex-1">
                    <FieldLabel className="text-xs">Dish</FieldLabel>
                    <NativeSelect value={l.dishId} onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, dishId: e.target.value } : x)))}>
                      {dishes.map((d) => <NativeSelectOption key={d.id} value={d.id}>{d.name}</NativeSelectOption>)}
                    </NativeSelect>
                  </Field>
                  <Field className="w-32">
                    <FieldLabel className="text-xs">Plates</FieldLabel>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" aria-label="Fewer" onClick={() => setLines(lines.map((x, i) => (i === idx ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>−</Button>
                      <Input type="number" min={1} inputMode="numeric" value={l.qty} onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, qty: Math.max(0, Number(e.target.value)) } : x)))} className="h-8 w-16 text-center text-base tabular-nums" />
                      <Button variant="outline" size="icon" aria-label="More" onClick={() => setLines(lines.map((x, i) => (i === idx ? { ...x, qty: x.qty + 1 } : x)))}>+</Button>
                    </div>
                  </Field>
                  {l.aiLabel ? (
                    <Badge variant="secondary" className="tabular-nums">AI: {l.aiLabel}{l.aiConfidence != null ? ` · ${Math.round(l.aiConfidence * 100)}%` : ""}</Badge>
                  ) : <Badge variant="outline">manual</Badge>}
                </div>
              ))}
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setLines([...lines, { key: `manual-${lines.length}`, dishId: dishes[0]?.id ?? "", qty: 1, selected: true }])}>+ Add another dish</Button>
            </div>
          ) : !recognizing ? (
            <p className="text-sm text-muted-foreground">Take a photo first, or{" "}
              <Button variant="link" size="xs" className="px-0" onClick={() => setLines([{ key: "manual-0", dishId: dishes[0]?.id ?? "", qty: 1, selected: true }])}>log without a photo</Button>.
            </p>
          ) : null}

          <Field>
            <FieldLabel>Reason</FieldLabel>
            <ToggleGroup value={[reason]} onValueChange={(v) => { const r = (v as string[])[0]; if (r) setReason(r as WasteReason); }} variant="outline" size="lg" className="flex-wrap justify-start gap-2" spacing={1}>
              {WASTE_REASONS.map((k) => <ToggleGroupItem key={k} value={k} className="rounded-full px-4">{WASTE_REASON_LABEL[k]}</ToggleGroupItem>)}
            </ToggleGroup>
          </Field>

          {savedCount != null ? (
            <Alert>
              <Check />
              <AlertTitle>Saved {savedCount} {savedCount === 1 ? "entry" : "entries"}</AlertTitle>
              <AlertDescription>They show up in the waste log and on the heatmap. Ready for the next tray.</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button size="lg" disabled={saving || recognizing || !lines.some((l) => l.selected)} onClick={save}>
              {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              Save {lines.filter((l) => l.selected).length || ""} {lines.filter((l) => l.selected).length === 1 ? "item" : "items"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
