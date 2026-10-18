import { ApiError, handle, readJson, requireOutletAccess, requireString } from "@/lib/api";
import { isIsoDate, tomorrow } from "@/lib/dates";
import { getOrCreatePlan, regenerateDraft } from "@/lib/prep-plans";

/** GET /api/prep-plans?outletId=&date=  — the day's plan, drafted from forecasts if new. */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const outletId = requireString(url.searchParams.get("outletId"), "outletId");
  await requireOutletAccess(outletId);
  const date = url.searchParams.get("date") ?? tomorrow();
  if (!isIsoDate(date)) throw new ApiError("date must be YYYY-MM-DD.");
  return Response.json(await getOrCreatePlan(outletId, date));
});

/** POST /api/prep-plans { outletId, date } — discard the draft and rebuild it from fresh forecasts. */
export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  const outletId = requireString(body.outletId, "outletId");
  await requireOutletAccess(outletId);
  const date = requireString(body.date, "date");
  if (!isIsoDate(date)) throw new ApiError("date must be YYYY-MM-DD.");
  return Response.json(await regenerateDraft(outletId, date));
});
