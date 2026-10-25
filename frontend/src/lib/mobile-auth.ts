import "server-only";

import { ApiError, handle } from "@/lib/api";
import { listOutlets, type OutletSummary, type Viewer } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";
import { bearerToken, hasRole, pickOutlet, signMobileToken, verifyMobileToken, type MobileRole } from "@/lib/mobile-token";

/**
 * Bearer-token auth for the Expo app (`/api/mobile/*`, see docs/mobile-api.md).
 * The web app keeps using Auth.js cookies; this is a parallel, stateless path
 * that signs its own HS256 JWT with AUTH_SECRET.
 */

export { bearerToken, pickOutlet, signMobileToken, verifyMobileToken } from "@/lib/mobile-token";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

/** Route wrapper: JSON errors (via `handle`) plus CORS headers on every response. */
export function mobileRoute<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  const inner = handle(fn);
  return async (...args: A): Promise<Response> => withCors(await inner(...args));
}

/** `export const OPTIONS = preflight` in every mobile route. */
export async function preflight(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function secret(): string {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) throw new ApiError("AUTH_SECRET is not configured on the server.", 500);
  return value;
}

export type MobileUser = {
  id: string;
  name: string | null;
  email: string;
  role: MobileRole;
  organizationName: string | null;
};

export type MobileSession = { viewer: Viewer; user: MobileUser };

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  organizationId: true,
  organization: { select: { name: true } },
} as const;

type UserRow = { id: string; name: string | null; email: string; role: MobileRole; organizationId: string | null; organization: { name: string } | null };

function toSession(u: UserRow): MobileSession {
  return {
    viewer: { id: u.id, name: u.name ?? u.email, role: u.role, organizationId: u.organizationId },
    user: { id: u.id, name: u.name, email: u.email, role: u.role, organizationName: u.organization?.name ?? null },
  };
}

export function issueToken(viewer: Viewer): string {
  return signMobileToken({ sub: viewer.id, role: viewer.role, orgId: viewer.organizationId }, secret());
}

/** Look up a user by email for login (password is checked by the caller). */
export async function findLoginUser(email: string) {
  const row = await prisma.user.findUnique({ where: { email }, select: { ...userSelect, passwordHash: true } });
  if (!row) return null;
  return { passwordHash: row.passwordHash, session: toSession(row) };
}

/**
 * The caller from the bearer token (401 otherwise). The user row is re-read on
 * every request so role/org changes and deleted accounts take effect at once.
 */
export async function requireMobileSession(req: Request): Promise<MobileSession> {
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) throw new ApiError("Missing bearer token.", 401);
  const claims = verifyMobileToken(token, secret());
  if (!claims) throw new ApiError("Invalid or expired token.", 401);
  const row = await prisma.user.findUnique({ where: { id: claims.sub }, select: userSelect });
  if (!row) throw new ApiError("Account no longer exists.", 401);
  return toSession(row);
}

export function requireMobileRole(viewer: Viewer, ...roles: MobileRole[]) {
  if (!hasRole(viewer.role, roles)) throw new ApiError("You do not have permission to do that.", 403);
}

/** `{ user, outlets }` as returned by login and /me. */
export function profile(session: MobileSession, outlets: OutletSummary[]) {
  return { user: session.user, outlets: outlets.map((o) => ({ id: o.id, name: o.name })) };
}

/** Outlet the request is about: `requested` if visible to the user (403 otherwise), else their first outlet. */
export async function resolveMobileOutlet(viewer: Viewer, requested: string | null | undefined): Promise<OutletSummary> {
  const pick = pickOutlet(await listOutlets(viewer), requested);
  if (!pick.ok) throw new ApiError(pick.error, pick.status);
  return pick.outlet;
}

/** Signed-in caller plus the outlet from `outletId` (query string or body). */
export async function requireMobileOutlet(req: Request, outletId: unknown, ...roles: MobileRole[]) {
  const session = await requireMobileSession(req);
  if (roles.length) requireMobileRole(session.viewer, ...roles);
  const outlet = await resolveMobileOutlet(session.viewer, typeof outletId === "string" ? outletId : null);
  return { ...session, outlet };
}
