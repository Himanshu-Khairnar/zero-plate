"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockTab, type StockRowView } from "@/components/inventory/stock-tab";
import { SuppliersTab, type SupplierView } from "@/components/inventory/suppliers-tab";
import { OrdersTab, type PurchaseOrderView } from "@/components/inventory/orders-tab";

export type IngredientOption = { id: string; name: string; unit: string; costPerUnit: number };

export function InventoryManager({
  outletId,
  canEdit,
  stock,
  suppliers,
  orders,
  ingredients,
  initialTab = "stock",
}: {
  outletId: string;
  canEdit: boolean;
  stock: StockRowView[];
  suppliers: SupplierView[];
  orders: PurchaseOrderView[];
  ingredients: IngredientOption[];
  initialTab?: string;
}) {
  const [tab, setTab] = useState(initialTab);
  const openOrders = orders.filter((o) => o.status === "SUGGESTED" || o.status === "ORDERED").length;
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
      <TabsList>
        <TabsTrigger value="stock">Stock ({stock.length})</TabsTrigger>
        <TabsTrigger value="suppliers">Suppliers ({suppliers.length})</TabsTrigger>
        <TabsTrigger value="orders">Purchase orders{openOrders ? ` (${openOrders} open)` : ""}</TabsTrigger>
      </TabsList>
      <TabsContent value="stock" className="mt-4">
        <StockTab outletId={outletId} rows={stock} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="suppliers" className="mt-4">
        <SuppliersTab outletId={outletId} suppliers={suppliers} ingredients={ingredients} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="orders" className="mt-4">
        <OrdersTab outletId={outletId} orders={orders} ingredients={ingredients} canEdit={canEdit} />
      </TabsContent>
    </Tabs>
  );
}
