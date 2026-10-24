// Pure helpers for the mobile API (no Prisma, no server-only) so they can be unit tested.
// Server code should import them through `@/lib/mobile-auth`.

import { createHmac, timingSafeEqual } from "node:crypto";

export type MobileRole = "OWNER" | "MANAGER" | "KITCHEN_STAFF" | "PLATFORM_ADMIN";

export type MobileClaims = {
  sub: string;
  role: MobileRole;
  orgId: string | null;
  iat: number;
  exp: number;
};

export const MOBILE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const HEADER = { alg: "HS256", typ: "JWT" } as const;

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** HS256 JWT with `{ sub, role, orgId, iat, exp }`. */
export function signMobileToken(
  payload: { sub: string; role: MobileRole; orgId: string | null },
  secret: string,
  opts: { now?: number; ttlSeconds?: number } = {},
): string {
  if (!secret) throw new Error("Token secret is not configured.");
  const iat = opts.now ?? nowSeconds();
  const claims: MobileClaims = { sub: payload.sub, role: payload.role, orgId: payload.orgId, iat, exp: iat + (opts.ttlSeconds ?? MOBILE_TOKEN_TTL_SECONDS) };
  const body = `${b64url(JSON.stringify(HEADER))}.${b64url(JSON.stringify(claims))}`;
  return `${body}.${b64url(hmac(body, secret))}`;
}

/** The token's claims if the signature, algorithm and expiry check out, else null. */
export function verifyMobileToken(token: string, secret: string, now = nowSeconds()): MobileClaims | null {
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, sigPart] = parts;

  const expected = hmac(`${headerPart}.${payloadPart}`, secret);
  const given = Buffer.from(sigPart, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") return null;
    const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Partial<MobileClaims>;
    if (typeof claims.sub !== "string" || !claims.sub) return null;
    if (typeof claims.exp !== "number" || claims.exp <= now) return null;
    return {
      sub: claims.sub,
      role: claims.role as MobileRole,
      orgId: claims.orgId ?? null,
      iat: Number(claims.iat ?? 0),
      exp: claims.exp,
    };
  } catch {
    return null;
  }
}

/** Token from an `Authorization: Bearer <token>` header value. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export type OutletPick<T> = { ok: true; outlet: T } | { ok: false; status: 403 | 404; error: string };

/**
 * Pick the outlet a request is about from the ones the user may see:
 * the requested one if visible (403 otherwise), else the first one (404 if none).
 */
export function pickOutlet<T extends { id: string }>(visible: T[], requested: string | null | undefined): OutletPick<T> {
  const wanted = requested?.trim();
  if (wanted) {
    const outlet = visible.find((o) => o.id === wanted);
    return outlet ? { ok: true, outlet } : { ok: false, status: 403, error: "You do not have access to this outlet." };
  }
  const first = visible[0];
  return first ? { ok: true, outlet: first } : { ok: false, status: 404, error: "No outlet is set up for this account." };
}

export function hasRole(role: MobileRole, allowed: readonly MobileRole[]): boolean {
  return allowed.includes(role);
}
