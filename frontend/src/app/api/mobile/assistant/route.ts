import { readJson, requireString } from "@/lib/api";
import { askAssistant } from "@/lib/assistant/chat";
import { mobileRoute, preflight, requireMobileOutlet } from "@/lib/mobile-auth";

/** POST /api/mobile/assistant { outletId, message } → { reply } (single turn). */
export const POST = mobileRoute(async (req: Request) => {
  const body = await readJson<{ outletId?: unknown; message?: unknown }>(req);
  const message = requireString(body.message, "message");
  const { outlet } = await requireMobileOutlet(req, body.outletId);
  const { reply } = await askAssistant({ outletId: outlet.id, outletName: outlet.name }, [{ role: "user", content: message.slice(0, 2000) }]);
  return Response.json({ reply });
});

export const OPTIONS = preflight;
