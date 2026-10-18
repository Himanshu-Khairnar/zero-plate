"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";

import { importSales, saveManualSales, type ImportSummary } from "@/actions/sales";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { guessColumn, normaliseDate, parseCsv } from "@/lib/csv";
import { today } from "@/lib/dates";

type Dish = { id: string; name: string; price: number };
type Mapping = { date: string; dish: string; qty: string; price: string; shift: string };
type ParsedRow = { date: string; dish: string; qty: number; price?: number; shift: "lunch" | "dinner" | "all" };

export function SalesImport({ outletId, dishes }: { outletId: string; dishes: Dish[] }) {
  return (
    <Tabs defaultValue="csv">
      <TabsList>
        <TabsTrigger value="csv">CSV / Excel upload</TabsTrigger>
        <TabsTrigger value="manual">Manual daily entry</TabsTrigger>
        <TabsTrigger value="pos">POS API</TabsTrigger>
      </TabsList>
      <TabsContent value="csv" className="mt-4"><CsvWizard outletId={outletId} dishes={dishes} /></TabsContent>
      <TabsContent value="manual" className="mt-4"><ManualEntry outletId={outletId} dishes={dishes} /></TabsContent>
      <TabsContent value="pos" className="mt-4"><PosDocs outletId={outletId} /></TabsContent>
    </Tabs>
  );
}

function CsvWizard({ outletId, dishes }: { outletId: string; dishes: Dish[] }) {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [map, setMap] = useState<Mapping>({ date: "", dish: "", qty: "", price: "", shift: "" });
  const [createMissing, setCreateMissing] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File) {
    setFileName(file.name);
    let rows: string[][];
    if (/\.xlsx?$/i.test(file.name)) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: "yyyy-mm-dd" }) as unknown[][]).map((r) => r.map((c) => (c == null ? "" : String(c))));
    } else {
      rows = parseCsv(await file.text());
    }
    if (rows.length < 2) { toast.error("The file needs a header row and at least one data row."); return; }
    const hdr = rows[0].map((h) => h.trim());
    setHeaders(hdr);
    setData(rows.slice(1));
    setMap({
      date: guessColumn(hdr, ["date", "day"]),
      dish: guessColumn(hdr, ["dish", "item", "product", "name"]),
      qty: guessColumn(hdr, ["qty", "quantity", "sold", "units", "count"]),
      price: guessColumn(hdr, ["price", "rate", "amount"]),
      shift: guessColumn(hdr, ["shift", "meal"]),
    });
    setStep(2);
  }

  const analysis = useMemo(() => {
    if (step < 3) return null;
    const idx = (k: keyof Mapping) => headers.indexOf(map[k]);
    const iDate = idx("date"), iDish = idx("dish"), iQty = idx("qty"), iPrice = idx("price"), iShift = idx("shift");
    const known = new Set(dishes.map((d) => d.name.toLowerCase()));
    const rows: ParsedRow[] = [];
    const problems: string[] = [];
    const seen = new Set<string>();
    let duplicates = 0, badDates = 0, badQty = 0;
    const unknown = new Set<string>();
    const qtys: number[] = [];
    for (const r of data) {
      const date = normaliseDate(r[iDate] ?? "");
      const dish = (r[iDish] ?? "").trim();
      const qty = Number(r[iQty]);
      if (!date) { badDates++; continue; }
      if (!dish || !Number.isFinite(qty) || qty < 0) { badQty++; continue; }
      const shiftRaw = iShift >= 0 ? (r[iShift] ?? "").toLowerCase() : "";
      const shift: ParsedRow["shift"] = shiftRaw.includes("lunch") ? "lunch" : shiftRaw.includes("dinner") ? "dinner" : "all";
      const key = `${date}|${dish.toLowerCase()}|${shift}`;
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      if (!known.has(dish.toLowerCase())) unknown.add(dish);
      const price = iPrice >= 0 && r[iPrice] !== "" ? Number(r[iPrice]) : undefined;
      rows.push({ date, dish, qty: Math.round(qty), price: Number.isFinite(price) ? price : undefined, shift });
      qtys.push(qty);
    }
    const dates = [...new Set(rows.map((r) => r.date))].sort();
    let missingDays = 0;
    if (dates.length > 1) {
      const span = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000 + 1;
      missingDays = Math.max(0, Math.round(span) - dates.length);
    }
    const mean = qtys.reduce((s, q) => s + q, 0) / (qtys.length || 1);
    const sd = Math.sqrt(qtys.reduce((s, q) => s + (q - mean) ** 2, 0) / (qtys.length || 1));
    const extreme = rows.filter((r) => sd > 0 && Math.abs(r.qty - mean) > 4 * sd);
    if (badDates) problems.push(`${badDates} rows have an unreadable date and were skipped`);
    if (badQty) problems.push(`${badQty} rows have a missing dish or bad quantity and were skipped`);
    if (duplicates) problems.push(`${duplicates} duplicate rows (same day, dish and shift) were dropped`);
    if (missingDays) problems.push(`${missingDays} day${missingDays === 1 ? "" : "s"} missing between ${dates[0]} and ${dates[dates.length - 1]} (closed days are fine)`);
    if (extreme.length) problems.push(`${extreme.length} rows look extreme (more than 4 standard deviations from the mean), e.g. ${extreme[0].dish} ${extreme[0].qty} on ${extreme[0].date}`);
    return { rows, problems, unknown: [...unknown], dates };
  }, [step, headers, map, data, dishes]);

  function submit() {
    if (!analysis) return;
    start(async () => {
      const r = await importSales({ outletId, rows: analysis.rows, mode: "replace_days", createMissingDishes: createMissing });
      if (!r.ok) { toast.error(r.error); return; }
      setSummary(r.data);
      setStep(4);
      toast.success(`${r.data.inserted} rows imported`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import past sales</CardTitle>
        <CardDescription>Upload a CSV or Excel export from your POS or a spreadsheet. Columns needed: date, dish, quantity. Price and shift are optional.</CardDescription>
        <Progress value={(step / 4) * 100} className="mt-3" />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {step === 1 ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center transition-colors hover:bg-muted/50">
            <Upload className="size-6 text-muted-foreground" />
            <span className="font-medium">Choose a .csv or .xlsx file</span>
            <span className="text-xs text-muted-foreground">Example header: date, dish, qty, price, shift</span>
            <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        ) : null}

        {step === 2 ? (
          <>
            <p className="text-sm text-muted-foreground">
              <FileSpreadsheet className="mr-1 inline size-4" /> {fileName} · {data.length} rows. Map the columns:
            </p>
            <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {(["date", "dish", "qty", "price", "shift"] as (keyof Mapping)[]).map((k) => (
                <Field key={k}>
                  <FieldLabel htmlFor={`map-${k}`} className="capitalize">{k}{k === "price" || k === "shift" ? " (optional)" : ""}</FieldLabel>
                  <NativeSelect id={`map-${k}`} value={map[k]} onChange={(e) => setMap({ ...map, [k]: e.target.value })}>
                    <NativeSelectOption value="">—</NativeSelectOption>
                    {headers.map((h) => <NativeSelectOption key={h} value={h}>{h}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
              ))}
            </FieldGroup>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader><TableRow>{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{data.slice(0, 5).map((r, i) => <TableRow key={i}>{headers.map((_, j) => <TableCell key={j} className="text-xs">{r[j]}</TableCell>)}</TableRow>)}</TableBody>
              </Table>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button disabled={!map.date || !map.dish || !map.qty} onClick={() => setStep(3)}>Validate</Button>
            </div>
          </>
        ) : null}

        {step === 3 && analysis ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Rows ready" value={analysis.rows.length} />
              <Stat label="Days covered" value={analysis.dates.length} hint={analysis.dates.length ? `${analysis.dates[0]} → ${analysis.dates[analysis.dates.length - 1]}` : ""} />
              <Stat label="Unknown dishes" value={analysis.unknown.length} />
            </div>
            {analysis.problems.length ? (
              <Alert>
                <AlertTriangle />
                <AlertTitle>Checks</AlertTitle>
                <AlertDescription><ul className="list-disc pl-4">{analysis.problems.map((p) => <li key={p}>{p}</li>)}</ul></AlertDescription>
              </Alert>
            ) : (
              <Alert><CheckCircle2 /><AlertTitle>Looks clean</AlertTitle><AlertDescription>No missing days, duplicates or extreme values found.</AlertDescription></Alert>
            )}
            {analysis.unknown.length ? (
              <FieldDescription className="rounded-lg border p-3">
                Not on the menu: {analysis.unknown.map((u) => <Badge key={u} variant="outline" className="mr-1">{u}</Badge>)}
                <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={createMissing} onCheckedChange={(v) => setCreateMissing(Boolean(v))} /> Create these dishes automatically (otherwise their rows are skipped)
                </label>
              </FieldDescription>
            ) : null}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button disabled={pending || analysis.rows.length === 0} onClick={submit}>Import {analysis.rows.length} rows</Button>
            </div>
          </>
        ) : null}

        {step === 4 && summary ? (
          <>
            <Alert>
              <CheckCircle2 />
              <AlertTitle>Imported {summary.inserted} rows</AlertTitle>
              <AlertDescription>
                {summary.daysReplaced ? `${summary.daysReplaced} earlier rows for the same days were replaced. ` : ""}
                {summary.createdDishes.length ? `Created dishes: ${summary.createdDishes.join(", ")}. ` : ""}
                {summary.unknownDishes.length ? `Skipped unknown dishes: ${summary.unknownDishes.join(", ")}.` : ""}
                {" "}Forecasts pick this up on the next nightly run, or regenerate them on the Forecasts page.
              </AlertDescription>
            </Alert>
            <Button variant="outline" onClick={() => { setStep(1); setSummary(null); }}>Import another file</Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ManualEntry({ outletId, dishes }: { outletId: string; dishes: Dish[] }) {
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState<"lunch" | "dinner" | "all">("all");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pending, start] = useTransition();
  const total = Object.values(qty).reduce((s, q) => s + (q || 0), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter a day&apos;s sales by hand</CardTitle>
        <CardDescription>For outlets without a POS. Saving replaces earlier entries for the same day and shift.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <Field className="w-44"><FieldLabel htmlFor="m-date">Day</FieldLabel><Input id="m-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field className="w-40"><FieldLabel htmlFor="m-shift">Shift</FieldLabel>
            <NativeSelect id="m-shift" value={shift} onChange={(e) => setShift(e.target.value as typeof shift)}>
              <NativeSelectOption value="all">Whole day</NativeSelectOption><NativeSelectOption value="lunch">Lunch</NativeSelectOption><NativeSelectOption value="dinner">Dinner</NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {dishes.map((d) => (
            <label key={d.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="text-sm font-medium">{d.name}</span>
              <Input type="number" min={0} inputMode="numeric" className="h-9 w-24 text-right text-base tabular-nums" value={qty[d.id] ?? ""} placeholder="0" onChange={(e) => setQty({ ...qty, [d.id]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{total} plates</span>
          <Button disabled={pending || total === 0} onClick={() => start(async () => {
            const r = await saveManualSales({ outletId, date, shift, entries: Object.entries(qty).map(([dishId, q]) => ({ dishId, qty: q || 0 })) });
            if (r.ok) { toast.success("Sales saved"); setQty({}); } else toast.error(r.error);
          })}>Save day</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PosDocs({ outletId }: { outletId: string }) {
  const example = JSON.stringify({ outletId, rows: [{ date: today(), dish: "Masala Dosa", qty: 42, price: 110, shift: "lunch" }] }, null, 2);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mock POS integration</CardTitle>
        <CardDescription>A POS can push sales automatically. The endpoint accepts the same rows as the CSV wizard and is protected by the key in <code>POS_API_KEY</code>.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{`POST /api/pos/sales
x-pos-key: <POS_API_KEY>
content-type: application/json

${example}`}</pre>
        <p className="text-muted-foreground">Rows for the same dish and day replace earlier ones, so the POS can resend a day safely. Unknown dishes are reported back rather than created.</p>
      </CardContent>
    </Card>
  );
}
