// Types for the WasteLess mobile API. Source of truth: docs/mobile-api.md

export type Role = "OWNER" | "MANAGER" | "KITCHEN_STAFF" | "PLATFORM_ADMIN";
export type Shift = "LUNCH" | "DINNER";
export type PrepStatus = "NONE" | "DRAFT" | "APPROVED";
export type PrepPlanStatus = "DRAFT" | "APPROVED" | "LOCKED";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** null for platform admins */
  organizationName: string | null;
};

export type Outlet = { id: string; name: string };

export type MeResponse = { user: User; outlets: Outlet[] };
export type LoginResponse = MeResponse & { token: string };

export type DashboardResponse = {
  date: string;
  kpis: {
    forecastCovers: number;
    wasteKg: number;
    wasteValue: number;
    revenue: number;
    /** null until forecasts and actuals overlap */
    accuracyPct: number | null;
    mealsDonated: number;
  };
  alertsOpen: number;
  /** status of tomorrow's plan (LOCKED is reported as APPROVED) */
  prepStatus: PrepStatus;
  wasteTrend: { date: string; wasteKg: number }[];
};

export type ForecastsResponse = {
  days: {
    date: string;
    items: { dishId: string; dishName: string; low: number; likely: number; high: number }[];
  }[];
};

export type PrepPlanItem = {
  id: string;
  dishId: string;
  dishName: string;
  forecastQty: number;
  plannedQty: number;
  unit: string;
};

/** date defaults to tomorrow; plan is null when none has been drafted (drafting is web-only). */
export type PrepPlanResponse = {
  plan: null | { id: string; date: string; status: PrepPlanStatus; items: PrepPlanItem[] };
};

export type KitchenDish = {
  dishId: string;
  dishName: string;
  target: number;
  prepared: number;
  sold: number;
  leftover: number;
  /** This day's own row per shift (what kitchen/log overwrites). */
  shifts: Record<Shift, { prepared: number; sold: number }>;
};

/** Counts are summed over LUNCH + DINNER; date defaults to today (UTC). */
export type KitchenResponse = { date: string; locked: boolean; dishes: KitchenDish[] };

export type KitchenLogBody = {
  outletId: string;
  dishId: string;
  shift: Shift;
  prepared: number;
  sold: number;
};

export type WasteItem = {
  id: string;
  date: string;
  dishName: string | null;
  ingredientName: string | null;
  qty: number;
  unit: string;
  reason: string;
  value: number;
};

export type WasteResponse = { items: WasteItem[] };

export type WasteBody = {
  outletId: string;
  dishId?: string;
  ingredientId?: string;
  qty: number;
  unit: string;
  reason: string;
  note?: string;
};

export type WasteOptionsResponse = {
  dishes: { id: string; name: string }[];
  ingredients: { id: string; name: string; unit: string }[];
  reasons: string[];
};

export type Alert = {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

export type AlertsResponse = { items: Alert[] };

export type DonationsResponse = {
  mealsDonated: number;
  items: { id: string; date: string; ngoName: string | null; meals: number; status: string }[];
};

export type AssistantResponse = { reply: string };
export type OkResponse = { ok: true };
