import { z } from "zod";

import { ApiError, readJson } from "@/lib/api";
import { createInvitation } from "@/lib/invites";
import { mobileRoute, preflight, requireMobileRole, requireMobileSession, resolveMobileOutlet } from "@/lib/mobile-auth";

const bodySchema = z.object({
  email: z.email().trim(),
  role: z.enum(["MANAGER", "KITCHEN_STAFF"]),
  outletIds: z.array(z.string().min(1)).min(1),
});

/**
 * POST /api/mobile/staff/invite { email, role, outletIds } (OWNER/MANAGER, same rules as the
 * web invite form). Every outlet must be visible to the inviter (403). An invitation carries
 * one outlet, so the first id is attached; more can be assigned on the web Staff page later.
 * A user with that email already exists gives 409.
 */
export const POST = mobileRoute(async (req: Request) => {
  const { viewer } = await requireMobileSession(req);
  requireMobileRole(viewer, "OWNER", "MANAGER");
  if (!viewer.organizationId) throw new ApiError("Your account is not linked to an organization.", 403);
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError("Give a valid email, a role (MANAGER or KITCHEN_STAFF) and at least one outlet.");
  const { email, role, outletIds } = parsed.data;
  for (const id of outletIds) await resolveMobileOutlet(viewer, id);

  const result = await createInvitation({ organizationId: viewer.organizationId, email, role, outletId: outletIds[0] });
  if (!result.ok) throw new ApiError("A user with this email already exists.", 409);
  return Response.json({ ok: true, inviteUrl: result.inviteUrl });
});

export const OPTIONS = preflight;
