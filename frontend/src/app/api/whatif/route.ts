import { ApiError, handle, readJson, requireOutletAccess, requireString } from "@/lib/api";
import { isIsoDate } from "@/lib/dates";
import { ml, type Scenario } from "@/lib/ml";
import { whatIfResult } from "@/lib/whatif";

export type { WhatIfLine, WhatIfTotals } from "@/lib/whatif";

/**
 * POST /api/whatif { outletId, date, scenario }
 * The ML service returns baseline and scenario demand; here we apply the same
 * risk-aware prep rule the daily plan uses, so the two always agree.
 */
export const POST = handle(async (req: Request) => {
  const body = await readJson<{ outletId?: unknown; date?: unknown; scenario?: Scenario }>(req);
  const outletId = requireString(body.outletId, "outletId");
  await requireOutletAccess(outletId);
  const date = requireString(body.date, "date");
  if (!isIsoDate(date)) throw new ApiError("date must be YYYY-MM-DD.");
  const scenario: Scenario = body.scenario ?? {};

  return Response.json(whatIfResult(await ml.whatIf({ outletId, date, scenario }), scenario));
});
