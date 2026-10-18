"use client";

import { useMemo, useState, useTransition } from "react";
import { ChefHat, Leaf, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { deleteDish, deleteIngredient, saveRecipe, upsertDish, upsertIngredient } from "@/actions/menu";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inr, pct } from "@/lib/format";
import { costPerPlate } from "@/lib/prep";

export type MenuDish = {
  id: string;
  name: string;
  category: string;
  price: number;
  isVeg: boolean;
  isActive: boolean;
  recipe: { ingredientId: string; qtyPerPlate: number }[];
};
export type MenuIngredient = { id: string; name: string; unit: string; costPerUnit: number; shelfLifeDays: number; usedIn: number };

const CATEGORIES = ["Breakfast", "Mains", "Street", "Beverages", "Desserts", "Sides"];

export function MenuManager({ outletId, dishes, ingredients, canEdit }: { outletId: string; dishes: MenuDish[]; ingredients: MenuIngredient[]; canEdit: boolean }) {
  const [dishDialog, setDishDialog] = useState<MenuDish | "new" | null>(null);
  const [recipeDialog, setRecipeDialog] = useState<MenuDish | null>(null);
  const [ingDialog, setIngDialog] = useState<MenuIngredient | "new" | null>(null);
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  const costOf = (d: MenuDish) =>
    costPerPlate(d.recipe.map((r) => ({ qtyPerPlate: r.qtyPerPlate, costPerUnit: ingById.get(r.ingredientId)?.costPerUnit ?? 0 })));

  return (
    <Tabs defaultValue="dishes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="dishes">Dishes ({dishes.length})</TabsTrigger>
          <TabsTrigger value="ingredients">Ingredients ({ingredients.length})</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="dishes" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Dishes</CardTitle>
            <CardDescription>Cost per plate and margin come from the recipe and current ingredient prices.</CardDescription>
            {canEdit ? (
              <Button size="sm" onClick={() => setDishDialog("new")} className="sm:absolute sm:top-5 sm:right-5">
                <Plus data-icon="inline-start" /> Add dish
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {dishes.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><UtensilsCrossed /></EmptyMedia>
                  <EmptyTitle>No dishes yet</EmptyTitle>
                  <EmptyDescription>Add the dishes this outlet sells, then build their recipes.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dish</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Cost / plate</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead>Recipe</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit ? <TableHead className="w-28" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dishes.map((d) => {
                    const cost = costOf(d);
                    const margin = d.price > 0 ? ((d.price - cost) / d.price) * 100 : 0;
                    return (
                      <TableRow key={d.id} className={!d.isActive ? "opacity-60" : undefined}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            <span className={`inline-block size-2.5 rounded-sm border ${d.isVeg ? "border-primary/30 bg-primary/20" : "border-foreground/40 bg-foreground/20"}`} aria-label={d.isVeg ? "Veg" : "Non-veg"} />
                            {d.name}
                          </span>
                        </TableCell>
                        <TableCell><Badge variant="outline">{d.category}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{inr(d.price)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{inr(cost)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${margin < 40 ? "text-primary/80" : ""}`}>{d.recipe.length ? pct(margin, 0) : "—"}</TableCell>
                        <TableCell>
                          <Button variant="link" size="xs" onClick={() => setRecipeDialog(d)}>
                            <ChefHat data-icon="inline-start" /> {d.recipe.length ? `${d.recipe.length} ingredients` : canEdit ? "Build recipe" : "No recipe"}
                          </Button>
                        </TableCell>
                        <TableCell><Badge variant={d.isActive ? "secondary" : "outline"}>{d.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                        {canEdit ? (
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon-sm" aria-label="Edit dish" onClick={() => setDishDialog(d)}><Pencil /></Button>
                            <DeleteButton label={`Delete ${d.name}?`} onConfirm={async () => deleteDish(outletId, d.id)} />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="ingredients" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Ingredients</CardTitle>
            <CardDescription>Units, current cost and shelf life. Prices feed cost per plate and purchase orders.</CardDescription>
            {canEdit ? (
              <Button size="sm" onClick={() => setIngDialog("new")} className="sm:absolute sm:top-5 sm:right-5">
                <Plus data-icon="inline-start" /> Add ingredient
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {ingredients.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Leaf /></EmptyMedia>
                  <EmptyTitle>No ingredients yet</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingredient</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Cost / unit</TableHead>
                    <TableHead className="text-right">Shelf life</TableHead>
                    <TableHead className="text-right">Used in</TableHead>
                    {canEdit ? <TableHead className="w-28" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredients.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell><Badge variant="outline">{i.unit}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{inr(i.costPerUnit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{i.shelfLifeDays} d</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{i.usedIn} dishes</TableCell>
                      {canEdit ? (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon-sm" aria-label="Edit ingredient" onClick={() => setIngDialog(i)}><Pencil /></Button>
                          <DeleteButton label={`Delete ${i.name}?`} onConfirm={async () => deleteIngredient(outletId, i.id)} />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {dishDialog ? <DishDialog outletId={outletId} dish={dishDialog === "new" ? null : dishDialog} onClose={() => setDishDialog(null)} /> : null}
      {ingDialog ? <IngredientDialog outletId={outletId} ingredient={ingDialog === "new" ? null : ingDialog} onClose={() => setIngDialog(null)} /> : null}
      {recipeDialog ? <RecipeDialog outletId={outletId} dish={recipeDialog} ingredients={ingredients} canEdit={canEdit} onClose={() => setRecipeDialog(null)} /> : null}
    </Tabs>
  );
}

function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => Promise<{ ok: boolean; error?: string }> }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(label)) return;
        start(async () => {
          const r = await onConfirm();
          if (r.ok) toast.success("Deleted");
          else toast.error(r.error ?? "Could not delete");
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}

function DishDialog({ outletId, dish, onClose }: { outletId: string; dish: MenuDish | null; onClose: () => void }) {
  const [form, setForm] = useState({ name: dish?.name ?? "", category: dish?.category ?? "Mains", price: dish?.price ?? 0, isVeg: dish?.isVeg ?? true, isActive: dish?.isActive ?? true });
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dish ? "Edit dish" : "Add dish"}</DialogTitle>
          <DialogDescription>Name, category and selling price. Build the recipe afterwards.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="dish-name">Name</FieldLabel>
            <Input id="dish-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="dish-cat">Category</FieldLabel>
              <NativeSelect id="dish-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="dish-price">Price (₹)</FieldLabel>
              <Input id="dish-price" type="number" min={0} step="1" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isVeg} onCheckedChange={(v) => setForm({ ...form, isVeg: Boolean(v) })} /> Vegetarian</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: Boolean(v) })} /> On the menu</label>
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !form.name.trim()}
            onClick={() =>
              start(async () => {
                const r = await upsertDish({ ...form, id: dish?.id, outletId });
                if (r.ok) { toast.success(dish ? "Dish updated" : "Dish added"); onClose(); } else toast.error(r.error);
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

function IngredientDialog({ outletId, ingredient, onClose }: { outletId: string; ingredient: MenuIngredient | null; onClose: () => void }) {
  const [form, setForm] = useState({ name: ingredient?.name ?? "", unit: (ingredient?.unit ?? "kg") as "kg" | "l" | "pcs", costPerUnit: ingredient?.costPerUnit ?? 0, shelfLifeDays: ingredient?.shelfLifeDays ?? 3 });
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ingredient ? "Edit ingredient" : "Add ingredient"}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ing-name">Name</FieldLabel>
            <Input id="ing-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field>
              <FieldLabel htmlFor="ing-unit">Unit</FieldLabel>
              <NativeSelect id="ing-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as "kg" | "l" | "pcs" })}>
                <NativeSelectOption value="kg">kg</NativeSelectOption>
                <NativeSelectOption value="l">litre</NativeSelectOption>
                <NativeSelectOption value="pcs">pieces</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-cost">Cost / unit (₹)</FieldLabel>
              <Input id="ing-cost" type="number" min={0} step="0.5" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: Number(e.target.value) })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-shelf">Shelf life (days)</FieldLabel>
              <Input id="ing-shelf" type="number" min={1} value={form.shelfLifeDays} onChange={(e) => setForm({ ...form, shelfLifeDays: Number(e.target.value) })} />
            </Field>
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || !form.name.trim()}
            onClick={() =>
              start(async () => {
                const r = await upsertIngredient({ ...form, id: ingredient?.id, outletId });
                if (r.ok) { toast.success("Saved"); onClose(); } else toast.error(r.error);
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

function RecipeDialog({ outletId, dish, ingredients, canEdit, onClose }: { outletId: string; dish: MenuDish; ingredients: MenuIngredient[]; canEdit: boolean; onClose: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(dish.recipe.map((r) => [r.ingredientId, r.qtyPerPlate])));
  const [pending, start] = useTransition();
  const cost = ingredients.reduce((s, i) => s + (qty[i.id] ?? 0) * i.costPerUnit, 0);
  const margin = dish.price > 0 ? ((dish.price - cost) / dish.price) * 100 : 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recipe · {dish.name}</DialogTitle>
          <DialogDescription>Quantity of each ingredient per plate. Leave 0 for ingredients not used.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ingredient</TableHead>
                <TableHead className="w-40 text-right">Qty per plate</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ingredients.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.name} <span className="text-xs text-muted-foreground">({i.unit})</span></TableCell>
                  <TableCell className="text-right">
                    <Input type="number" min={0} step={i.unit === "pcs" ? 1 : 0.005} value={qty[i.id] ?? 0} disabled={!canEdit} onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })} className="ml-auto h-8 w-32 text-right tabular-nums" />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{inr((qty[i.id] ?? 0) * i.costPerUnit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm">
          <span>Cost per plate <strong className="tabular-nums">{inr(cost)}</strong></span>
          <span>Price <strong className="tabular-nums">{inr(dish.price)}</strong></span>
          <span className={margin < 40 ? "text-primary/80" : "text-primary"}>Margin <strong>{pct(margin, 0)}</strong></span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {canEdit ? (
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveRecipe({ outletId, dishId: dish.id, items: Object.entries(qty).map(([ingredientId, qtyPerPlate]) => ({ ingredientId, qtyPerPlate })) });
                  if (r.ok) { toast.success("Recipe saved"); onClose(); } else toast.error(r.error);
                })
              }
            >
              Save recipe
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
