"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";

import { importWorkbook, type SheetImportSummary } from "@/actions/import-sheets";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Parsed = {
  dishes: { name: string; category?: string; price?: number; isVeg?: boolean; isActive?: boolean }[];
  ingredients: { name: string; unit?: "kg" | "l" | "pcs"; costPerUnit?: number; shelfLifeDays?: number }[];
  recipes: { dish: string; ingredient: string; qtyPerPlate: number }[];
  stock: { ingredient: string; onHand: number; expiryDate?: string }[];
};

const yes = (v: unknown) => (v == null || v === "" ? undefined : /^(y|yes|true|1)$/i.test(String(v).trim()));
const num = (v: unknown) => (v == null || v === "" ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);
const str = (v: unknown) => (v == null ? "" : String(v).trim());
const unit = (v: unknown): "kg" | "l" | "pcs" | undefined => {
  const s = str(v).toLowerCase();
  if (!s) return undefined;
  if (s.startsWith("k")) return "kg";
  if (s.startsWith("l")) return "l";
  if (s.startsWith("p")) return "pcs";
  return undefined;
};

export function SheetImport({ outletId }: { outletId: string }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<SheetImportSummary | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheet = (name: string) => {
      const key = wb.SheetNames.find((n) => n.toLowerCase() === name);
      return key ? (XLSX.utils.sheet_to_json(wb.Sheets[key], { raw: false, dateNF: "yyyy-mm-dd", defval: "" }) as Record<string, unknown>[]) : [];
    };
    const p: Parsed = {
      dishes: sheet("dishes").filter((r) => str(r.name)).map((r) => ({ name: str(r.name), category: str(r.category) || undefined, price: num(r.price), isVeg: yes(r.isVeg), isActive: yes(r.isActive) })),
      ingredients: sheet("ingredients").filter((r) => str(r.name)).map((r) => ({ name: str(r.name), unit: unit(r.unit), costPerUnit: num(r.costPerUnit), shelfLifeDays: num(r.shelfLifeDays) })),
      recipes: sheet("recipes").filter((r) => str(r.dish) && str(r.ingredient)).map((r) => ({ dish: str(r.dish), ingredient: str(r.ingredient), qtyPerPlate: num(r.qtyPerPlate) ?? 0 })),
      stock: sheet("stock").filter((r) => str(r.ingredient) && num(r.onHand) != null).map((r) => ({ ingredient: str(r.ingredient), onHand: num(r.onHand) ?? 0, expiryDate: /^\d{4}-\d{2}-\d{2}$/.test(str(r.expiryDate)) ? str(r.expiryDate) : undefined })),
    };
    if (!p.dishes.length && !p.ingredients.length && !p.recipes.length && !p.stock.length) {
      toast.error("No Dishes, Ingredients, Recipes or Stock sheet found in this workbook.");
      return;
    }
    setFileName(file.name);
    setParsed(p);
    setSummary(null);
  }

  function apply() {
    if (!parsed) return;
    start(async () => {
      const r = await importWorkbook({ outletId, ...parsed });
      if (!r.ok) { toast.error(r.error); return; }
      setSummary(r.data);
      setParsed(null);
      toast.success("Workbook applied");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>1 · Get the sheet</CardTitle>
          <CardDescription>Download this outlet&apos;s current data as an Excel workbook. Edit it in Excel or Google Sheets.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" nativeButton={false} render={<a href={`/api/sheets?outletId=${outletId}&type=workbook`} />}>
            <Download data-icon="inline-start" /> Download data workbook (.xlsx)
          </Button>
          <Button variant="outline" nativeButton={false} render={<a href={`/api/sheets?outletId=${outletId}&type=sales-template`} />}>
            <Download data-icon="inline-start" /> Download sales template (.xlsx)
          </Button>
          <Table>
            <TableHeader><TableRow><TableHead>Sheet</TableHead><TableHead>Columns</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow><TableCell className="font-medium">Dishes</TableCell><TableCell className="text-xs text-muted-foreground">name, category, price, isVeg (yes/no), isActive (yes/no)</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Ingredients</TableCell><TableCell className="text-xs text-muted-foreground">name, unit (kg/l/pcs), costPerUnit, shelfLifeDays</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Recipes</TableCell><TableCell className="text-xs text-muted-foreground">dish, ingredient, qtyPerPlate</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Stock</TableCell><TableCell className="text-xs text-muted-foreground">ingredient, onHand, expiryDate (YYYY-MM-DD)</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2 · Upload and update</CardTitle>
          <CardDescription>Rows are matched by name: existing rows are updated, new names created, nothing deleted. Stock counts are booked as adjustments.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors hover:bg-muted/50">
            <Upload className="size-6 text-muted-foreground" />
            <span className="font-medium">Choose the edited .xlsx</span>
            <span className="text-xs text-muted-foreground">Sheets named Dishes, Ingredients, Recipes, Stock</span>
            <input type="file" accept=".xlsx,.xls" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>

          {parsed ? (
            <>
              <p className="text-sm"><FileSpreadsheet className="mr-1 inline size-4" /> {fileName}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{parsed.dishes.length} dishes</Badge>
                <Badge variant="secondary">{parsed.ingredients.length} ingredients</Badge>
                <Badge variant="secondary">{parsed.recipes.length} recipe lines</Badge>
                <Badge variant="secondary">{parsed.stock.length} stock counts</Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setParsed(null)}>Cancel</Button>
                <Button onClick={apply} disabled={pending}>Apply to {fileName ? "outlet" : ""}</Button>
              </div>
            </>
          ) : null}

          {summary ? (
            <Alert>
              <CheckCircle2 />
              <AlertTitle>Updated</AlertTitle>
              <AlertDescription>
                Dishes: {summary.dishes.created} created, {summary.dishes.updated} updated. Ingredients: {summary.ingredients.created} created, {summary.ingredients.updated} updated. Recipes saved for {summary.recipes.saved} dishes
                {summary.recipes.skipped.length ? ` (skipped: ${summary.recipes.skipped.slice(0, 5).join(", ")})` : ""}. Stock adjusted for {summary.stock.adjusted} ingredients
                {summary.stock.skipped.length ? ` (unknown: ${summary.stock.skipped.join(", ")})` : ""}.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
