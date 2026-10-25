import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessOutlet, type Viewer } from "@/lib/outlets";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Expected failure with a user-facing message. Server actions show the message;
 * the mobile API turns it into a JSON error with `status` (default 400).
 */
export class GuardError extends Error {
  constructor(
    message?: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Signed-in viewer for a server action, or throw. */
export async function requireActor(): Promise<Viewer> {
  const session = await auth();
  if (!session?.user) throw new GuardError("You must be signed in.");
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "User",
    role: session.user.role,
    organizationId: session.user.organizationId ?? null,
  };
}

export async function requireOutletActor(outletId: string, ...roles: Viewer["role"][]): Promise<Viewer> {
  const viewer = await requireActor();
  if (roles.length && !roles.includes(viewer.role)) throw new GuardError("You do not have permission to do that.");
  if (!(await canAccessOutlet(viewer, outletId))) throw new GuardError("You do not have access to this outlet.");
  return viewer;
}

/** Run an action body and turn thrown errors into a result object. */
export async function guarded<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    if (err instanceof GuardError) return { ok: false, error: err.message };
    if (err && typeof err === "object" && "issues" in err) return { ok: false, error: "Please check the form values." };
    console.error(err);
    return { ok: false, error: (err as Error).message || "Something went wrong." };
  }
}

export async function audit(
  viewer: Viewer,
  action: string,
  opts: { outletId?: string | null; entity?: string; entityId?: string; detail?: string } = {},
) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: viewer.organizationId,
        outletId: opts.outletId ?? null,
        userId: viewer.id,
        userName: viewer.name,
        action,
        entity: opts.entity,
        entityId: opts.entityId,
        detail: opts.detail,
      },
    });
  } catch (err) {
    console.error("audit log failed", err);
  }
}
