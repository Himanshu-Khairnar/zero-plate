import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { bearerToken, hasRole, MOBILE_TOKEN_TTL_SECONDS, pickOutlet, signMobileToken, verifyMobileToken } from "./mobile-token";
import { wasteKgOf } from "./waste";

const SECRET = "test-secret";
const NOW = 1_800_000_000;
const payload = { sub: "user_1", role: "MANAGER" as const, orgId: "org_1" };

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("signMobileToken / verifyMobileToken", () => {
  it("round-trips the claims with a 30 day expiry", () => {
    const token = signMobileToken(payload, SECRET, { now: NOW });
    const [header, body] = token.split(".");
    expect(decode(header)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(decode(body)).toEqual({ ...payload, iat: NOW, exp: NOW + 30 * 24 * 60 * 60 });
    expect(verifyMobileToken(token, SECRET, NOW + 60)).toEqual({ ...payload, iat: NOW, exp: NOW + MOBILE_TOKEN_TTL_SECONDS });
  });

  it("produces a standard HS256 signature", () => {
    const token = signMobileToken(payload, SECRET, { now: NOW });
    const [h, b, sig] = token.split(".");
    expect(sig).toBe(createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url"));
  });

  it("keeps a null organisation (platform admins)", () => {
    const token = signMobileToken({ sub: "admin", role: "PLATFORM_ADMIN", orgId: null }, SECRET, { now: NOW });
    expect(verifyMobileToken(token, SECRET, NOW)?.orgId).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = signMobileToken(payload, SECRET, { now: NOW, ttlSeconds: 10 });
    expect(verifyMobileToken(token, SECRET, NOW + 9)).not.toBeNull();
    expect(verifyMobileToken(token, SECRET, NOW + 10)).toBeNull();
  });

  it("rejects a wrong secret or a tampered payload", () => {
    const token = signMobileToken(payload, SECRET, { now: NOW });
    expect(verifyMobileToken(token, "other-secret", NOW)).toBeNull();
    const [h, , sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, role: "OWNER", iat: NOW, exp: NOW + 1000 })).toString("base64url");
    expect(verifyMobileToken(`${h}.${forged}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it("rejects other algorithms and malformed input", () => {
    const body = Buffer.from(JSON.stringify({ ...payload, iat: NOW, exp: NOW + 1000 })).toString("base64url");
    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(`${none}.${body}`).digest("base64url");
    expect(verifyMobileToken(`${none}.${body}.${sig}`, SECRET, NOW)).toBeNull();
    expect(verifyMobileToken(`${none}.${body}.`, SECRET, NOW)).toBeNull();
    expect(verifyMobileToken("not-a-jwt", SECRET, NOW)).toBeNull();
    expect(verifyMobileToken("", SECRET, NOW)).toBeNull();
  });

  it("refuses to sign or verify without a secret", () => {
    expect(() => signMobileToken(payload, "")).toThrow();
    expect(verifyMobileToken(signMobileToken(payload, SECRET), "")).toBeNull();
  });
});

describe("bearerToken", () => {
  it("extracts the token from an Authorization header", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerToken("bearer  abc")).toBe("abc");
  });
  it("returns null for missing or non-bearer headers", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerToken("Bearer ")).toBeNull();
  });
});

describe("pickOutlet", () => {
  const outlets = [{ id: "a", name: "Andheri" }, { id: "b", name: "Bandra" }];

  it("uses the requested outlet when the user can see it", () => {
    expect(pickOutlet(outlets, "b")).toEqual({ ok: true, outlet: outlets[1] });
  });
  it("defaults to the first visible outlet", () => {
    expect(pickOutlet(outlets, undefined)).toEqual({ ok: true, outlet: outlets[0] });
    expect(pickOutlet(outlets, "")).toEqual({ ok: true, outlet: outlets[0] });
    expect(pickOutlet(outlets, null)).toEqual({ ok: true, outlet: outlets[0] });
  });
  it("is 403 for an outlet the user cannot see", () => {
    expect(pickOutlet(outlets, "other-org-outlet")).toMatchObject({ ok: false, status: 403 });
    expect(pickOutlet([], "a")).toMatchObject({ ok: false, status: 403 });
  });
  it("is 404 when the user has no outlets at all", () => {
    expect(pickOutlet([], undefined)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("hasRole", () => {
  it("allows only the listed roles", () => {
    expect(hasRole("OWNER", ["OWNER", "MANAGER"])).toBe(true);
    expect(hasRole("KITCHEN_STAFF", ["OWNER", "MANAGER"])).toBe(false);
  });
});

describe("wasteKgOf", () => {
  it("converts plates and weight/volume units to kg", () => {
    expect(wasteKgOf(10, "plates")).toBeCloseTo(3.5);
    expect(wasteKgOf(2, "kg")).toBe(2);
    expect(wasteKgOf(1.5, "l")).toBe(1.5);
    expect(wasteKgOf(500, "g")).toBe(0.5);
  });
  it("counts pieces, unknown units and bad quantities as 0", () => {
    expect(wasteKgOf(4, "pcs")).toBe(0);
    expect(wasteKgOf(4, null)).toBe(0);
    expect(wasteKgOf(-1, "kg")).toBe(0);
    expect(wasteKgOf(Number.NaN, "kg")).toBe(0);
  });
});
