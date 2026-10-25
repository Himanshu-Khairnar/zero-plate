import { ApiError, readJson } from "@/lib/api";
import { ml, type Scenario } from "@/lib/ml";
import { mobileDate, mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";
import { whatIfResult } from "@/lib/whatif";

/** POST /api/mobile/whatif { outletId, date, scenario }: same body and response as /api/whatif. */
export const POST = mobileRoute(async (req: Request) => {
  const body = await readJson<{ outletId?: unknown; date?: unknown; scenario?: unknown }>(req);
  const { outlet } = await requireMobileOutlet(req, body.outletId);
  const date = mobileDate(body.date);
  if (body.scenario != null && (typeof body.scenario !== "object" || Array.isArray(body.scenario))) throw new ApiError("scenario must be an object.");
  const scenario = (body.scenario ?? {}) as Scenario;
  return Response.json(whatIfResult(await ml.whatIf({ outletId: outlet.id, date, scenario }), scenario));
});

export const OPTIONS = preflight;
