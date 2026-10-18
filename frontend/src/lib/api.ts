import "server-only";

import { auth } from "@/auth";
import { MlServiceError } from "@/lib/ml";
import { canAccessOutlet, type Viewer } from "@/lib/outlets";
import { PlanError } from "@/lib/prep-plans";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Wrap a route handler so every known failure becomes a clean JSON error. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError || err instanceof PlanError || err instanceof MlServiceError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return Response.json({ error: "Unexpected server error." }, { status: 500 });
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError("Request body must be JSON.");
  }
}

export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new ApiError(`${name} is required.`);
  return value.trim();
}

/** The signed-in user (401 otherwise). */
export async function requireSession(): Promise<Viewer> {
  const session = await auth();
  if (!session?.user) throw new ApiError("Sign in required.", 401);
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "User",
    role: session.user.role,
    organizationId: session.user.organizationId ?? null,
  };
}

/** Signed-in user who may see this outlet (403 otherwise). */
export async function requireOutletAccess(outletId: string): Promise<Viewer> {
  const viewer = await requireSession();
  if (!(await canAccessOutlet(viewer, outletId))) throw new ApiError("You do not have access to this outlet.", 403);
  return viewer;
}

export function requireRole(viewer: Viewer, ...roles: Viewer["role"][]) {
  if (!roles.includes(viewer.role)) throw new ApiError("You do not have permission to do that.", 403);
}
