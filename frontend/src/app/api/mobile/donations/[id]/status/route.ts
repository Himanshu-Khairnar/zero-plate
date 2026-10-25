import { z } from "zod";

import { ApiError, readJson } from "@/lib/api";
import { DONATION_STATUSES, setDonationStatus } from "@/lib/donations";
import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ outletId: z.string().min(1).nullish(), status: z.enum(DONATION_STATUSES) });

/** POST /api/mobile/donations/:id/status { outletId, status } (OWNER/MANAGER/KITCHEN_STAFF). */
export const POST = mobileRoute(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError("status must be PLANNED, COLLECTED or CANCELLED.");
  const { viewer, outlet } = await requireMobileOutlet(req, parsed.data.outletId, "OWNER", "MANAGER", "KITCHEN_STAFF");
  await setDonationStatus(viewer, outlet.id, id, parsed.data.status);
  return Response.json({ ok: true });
});

export const OPTIONS = preflight;
