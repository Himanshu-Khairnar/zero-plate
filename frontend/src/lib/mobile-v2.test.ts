import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Route-level checks for the v2 mobile API (docs/mobile-api.md): auth, roles and
// input validation run before any database write, so Prisma is a small stub.

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  outlet: { findMany: vi.fn() },
  dish: { findMany: vi.fn(async () => []) },
  kitchenLog: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  wasteLog: { findFirst: vi.fn(), delete: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { signMobileToken, type MobileRole } from "@/lib/mobile-token";

const SECRET = "test-secret";
const OUTLET = { id: "o1", name: "Andheri", city: "Mumbai", timezone: "Asia/Kolkata" };

function tokenFor(role: MobileRole) {
  db.user.findUnique.mockResolvedValue({ id: "u1", name: "Test", email: "t@x", role, organizationId: "org1", organization: { name: "Org" } });
  return signMobileToken({ sub: "u1", role, orgId: "org1" }, SECRET);
}

function jsonReq(path: string, role: MobileRole | null, body: unknown, method = "POST") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (role) headers.authorization = `Bearer ${tokenFor(role)}`;
  return new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function formReq(role: MobileRole, fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost/api/mobile/waste/recognize", { method: "POST", headers: { authorization: `Bearer ${tokenFor(role)}` }, body: fd });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  db.outlet.findMany.mockResolvedValue([OUTLET]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("auth and CORS", () => {
  it("401 without a bearer token, with CORS headers", async () => {
    const { POST } = await import("@/app/api/mobile/kitchen/lock/route");
    const res = await POST(jsonReq("/api/mobile/kitchen/lock", null, { outletId: "o1", date: "2026-10-25" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("preflight allows DELETE", async () => {
    const { OPTIONS } = await import("@/app/api/mobile/waste/[id]/route");
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("DELETE");
  });

  it("403 for an outlet the user cannot see", async () => {
    const { POST } = await import("@/app/api/mobile/alerts/read-all/route");
    const res = await POST(jsonReq("/api/mobile/alerts/read-all", "OWNER", { outletId: "other" }));
    expect(res.status).toBe(403);
  });
});

describe("role checks (403 before any write)", () => {
  it("kitchen staff cannot lock the day", async () => {
    const { POST } = await import("@/app/api/mobile/kitchen/lock/route");
    const res = await POST(jsonReq("/api/mobile/kitchen/lock", "KITCHEN_STAFF", { outletId: "o1", date: "2026-10-25" }));
    expect(res.status).toBe(403);
    expect(db.kitchenLog.updateMany).not.toHaveBeenCalled();
  });

  it("kitchen staff cannot generate a plan", async () => {
    const { POST } = await import("@/app/api/mobile/prep-plan/generate/route");
    const res = await POST(jsonReq("/api/mobile/prep-plan/generate", "KITCHEN_STAFF", { outletId: "o1", date: "2099-01-01" }));
    expect(res.status).toBe(403);
  });

  it("kitchen staff cannot adjust or approve a plan", async () => {
    const adjust = await import("@/app/api/mobile/prep-plan/[id]/adjust/route");
    const approve = await import("@/app/api/mobile/prep-plan/[id]/approve/route");
    const body = { changes: [{ dishId: "d1", plannedQty: 3 }] };
    expect((await adjust.POST(jsonReq("/api/mobile/prep-plan/p1/adjust", "KITCHEN_STAFF", body), ctx("p1"))).status).toBe(403);
    expect((await approve.POST(jsonReq("/api/mobile/prep-plan/p1/approve", "KITCHEN_STAFF", {}), ctx("p1"))).status).toBe(403);
  });

  it("kitchen staff cannot delete waste entries", async () => {
    const { DELETE } = await import("@/app/api/mobile/waste/[id]/route");
    const res = await DELETE(jsonReq("/api/mobile/waste/w1?outletId=o1", "KITCHEN_STAFF", undefined, "DELETE"), ctx("w1"));
    expect(res.status).toBe(403);
    expect(db.wasteLog.delete).not.toHaveBeenCalled();
  });

  it("kitchen staff cannot run the anomaly scan or invite staff", async () => {
    const scan = await import("@/app/api/mobile/alerts/scan/route");
    const invite = await import("@/app/api/mobile/staff/invite/route");
    expect((await scan.POST(jsonReq("/api/mobile/alerts/scan", "KITCHEN_STAFF", { outletId: "o1" }))).status).toBe(403);
    const body = { email: "new@x.com", role: "KITCHEN_STAFF", outletIds: ["o1"] };
    expect((await invite.POST(jsonReq("/api/mobile/staff/invite", "KITCHEN_STAFF", body))).status).toBe(403);
  });
});

describe("validation and conflicts", () => {
  it("lock: already locked day is 409", async () => {
    db.kitchenLog.findFirst.mockResolvedValue({ id: "k1" });
    const { POST } = await import("@/app/api/mobile/kitchen/lock/route");
    const res = await POST(jsonReq("/api/mobile/kitchen/lock", "MANAGER", { outletId: "o1", date: "2026-10-25" }));
    expect(res.status).toBe(409);
    expect(db.kitchenLog.updateMany).not.toHaveBeenCalled();
  });

  it("lock: bad date is 400", async () => {
    const { POST } = await import("@/app/api/mobile/kitchen/lock/route");
    const res = await POST(jsonReq("/api/mobile/kitchen/lock", "OWNER", { outletId: "o1", date: "25/10/2026" }));
    expect(res.status).toBe(400);
  });

  it("waste delete: entry from another outlet is 404", async () => {
    db.wasteLog.findFirst.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/mobile/waste/[id]/route");
    const res = await DELETE(jsonReq("/api/mobile/waste/w1?outletId=o1", "OWNER", undefined, "DELETE"), ctx("w1"));
    expect(res.status).toBe(404);
  });

  it("donation status must be a known value", async () => {
    const { POST } = await import("@/app/api/mobile/donations/[id]/status/route");
    const res = await POST(jsonReq("/api/mobile/donations/d1/status", "OWNER", { outletId: "o1", status: "LOST" }), ctx("d1"));
    expect(res.status).toBe(400);
  });

  it("invite: bad email is 400", async () => {
    const { POST } = await import("@/app/api/mobile/staff/invite/route");
    const res = await POST(jsonReq("/api/mobile/staff/invite", "OWNER", { email: "nope", role: "MANAGER", outletIds: ["o1"] }));
    expect(res.status).toBe(400);
  });
});

describe("waste photo recognition", () => {
  const jpeg = (bytes: number, type = "image/jpeg") => new File([new Uint8Array(bytes)], "p.jpg", { type });

  it("400 when the body is not multipart", async () => {
    const { POST } = await import("@/app/api/mobile/waste/recognize/route");
    const res = await POST(jsonReq("/api/mobile/waste/recognize", "OWNER", { outletId: "o1" }));
    expect(res.status).toBe(400);
  });

  it("400 for a missing photo, a wrong type or more than 5 MB", async () => {
    const { POST } = await import("@/app/api/mobile/waste/recognize/route");
    expect((await POST(formReq("OWNER", { outletId: "o1" }))).status).toBe(400);
    expect((await POST(formReq("OWNER", { outletId: "o1", photo: jpeg(10, "image/gif") }))).status).toBe(400);
    expect((await POST(formReq("OWNER", { outletId: "o1", photo: jpeg(5 * 1024 * 1024 + 1) }))).status).toBe(400);
  });

  it("503 with a message when the ML service is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const { POST } = await import("@/app/api/mobile/waste/recognize/route");
    const res = await POST(formReq("KITCHEN_STAFF", { outletId: "o1", photo: jpeg(100) }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/offline/);
  });

  it("returns the VisionResult with dish ids attached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [{ label: "rice", dishName: "Jeera Rice", estimatedQty: 2, confidence: 0.8 }], model: "cv", note: "" })));
    db.dish.findMany.mockResolvedValueOnce([{ id: "d9", name: "Jeera Rice" }] as never);
    const { POST } = await import("@/app/api/mobile/waste/recognize/route");
    const res = await POST(formReq("OWNER", { outletId: "o1", photo: jpeg(100, "image/png") }));
    expect(res.status).toBe(200);
    expect((await res.json()).items[0].dishId).toBe("d9");
  });
});
