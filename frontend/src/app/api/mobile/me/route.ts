import { mobileRoute, preflight, profile, requireMobileSession } from "@/lib/mobile-auth";
import { listOutlets } from "@/lib/outlets";

/** GET /api/mobile/me → { user, outlets } */
export const GET = mobileRoute(async (req: Request) => {
  const session = await requireMobileSession(req);
  return Response.json(profile(session, await listOutlets(session.viewer)));
});

export const OPTIONS = preflight;
