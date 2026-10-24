import { ApiError, handle, readJson, requireOutletAccess, requireString } from "@/lib/api";
import { askAssistant, type ChatMessage } from "@/lib/assistant/chat";
import type { ToolContext } from "@/lib/assistant/tools";
import { prisma } from "@/lib/prisma";

/**
 * AI assistant (module L); the answering logic lives in `@/lib/assistant/chat`.
 *
 * POST /api/assistant { outletId, messages: [{ role: "user"|"assistant", content }] }
 */

export const POST = handle(async (req: Request) => {
  const body = await readJson<{ outletId?: unknown; messages?: unknown }>(req);
  const outletId = requireString(body.outletId, "outletId");
  await requireOutletAccess(outletId);
  if (!Array.isArray(body.messages) || body.messages.length === 0) throw new ApiError("messages[] is required.");
  const history = (body.messages as ChatMessage[]).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-20);
  if (history[history.length - 1]?.role !== "user") throw new ApiError("The last message must be from the user.");

  const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: outletId }, select: { name: true } });
  const ctx: ToolContext = { outletId, outletName: outlet.name };
  return Response.json(await askAssistant(ctx, history));
});
