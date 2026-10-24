import type {
  AlertsResponse,
  AssistantResponse,
  DashboardResponse,
  DonationsResponse,
  ForecastsResponse,
  KitchenLogBody,
  KitchenResponse,
  LoginResponse,
  MeResponse,
  OkResponse,
  PrepPlanResponse,
  WasteBody,
  WasteOptionsResponse,
  WasteResponse,
} from "./types";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:3100").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Session plumbing set by AuthProvider: current token and a 401 handler.
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

type Query = Record<string, string | number | undefined>;

function buildUrl(path: string, query?: Query) {
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${API_URL}/api/mobile${path}${qs ? `?${qs}` : ""}`;
}

async function request<T>(method: "GET" | "POST", path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(`Cannot reach the server at ${API_URL}. Check EXPO_PUBLIC_API_URL and that the server is running.`, 0);
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : null) ?? `Request failed (${res.status})`;
    // A 401 on login just means wrong credentials; anywhere else the session is dead.
    if (res.status === 401 && path !== "/auth/login") onUnauthorized?.();
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

const outletQ = (outletId: string, extra?: Query): Query => ({ outletId, ...extra });

export const api = {
  login: (email: string, password: string) => request<LoginResponse>("POST", "/auth/login", { body: { email, password } }),
  me: () => request<MeResponse>("GET", "/me"),
  dashboard: (outletId: string) => request<DashboardResponse>("GET", "/dashboard", { query: outletQ(outletId) }),
  forecasts: (outletId: string, days = 7) => request<ForecastsResponse>("GET", "/forecasts", { query: outletQ(outletId, { days }) }),
  prepPlan: (outletId: string, date?: string) => request<PrepPlanResponse>("GET", "/prep-plan", { query: outletQ(outletId, { date }) }),
  approvePrepPlan: (id: string) => request<OkResponse>("POST", `/prep-plan/${encodeURIComponent(id)}/approve`),
  kitchen: (outletId: string, date?: string) => request<KitchenResponse>("GET", "/kitchen", { query: outletQ(outletId, { date }) }),
  kitchenLog: (body: KitchenLogBody) => request<OkResponse>("POST", "/kitchen/log", { body }),
  waste: (outletId: string, limit = 30) => request<WasteResponse>("GET", "/waste", { query: outletQ(outletId, { limit }) }),
  logWaste: (body: WasteBody) => request<OkResponse & { id: string }>("POST", "/waste", { body }),
  wasteOptions: (outletId: string) => request<WasteOptionsResponse>("GET", "/waste/options", { query: outletQ(outletId) }),
  alerts: (outletId: string) => request<AlertsResponse>("GET", "/alerts", { query: outletQ(outletId) }),
  markAlertRead: (id: string) => request<OkResponse>("POST", `/alerts/${encodeURIComponent(id)}/read`),
  donations: (outletId: string) => request<DonationsResponse>("GET", "/donations", { query: outletQ(outletId) }),
  assistant: (outletId: string, message: string) => request<AssistantResponse>("POST", "/assistant", { body: { outletId, message } }),
};
