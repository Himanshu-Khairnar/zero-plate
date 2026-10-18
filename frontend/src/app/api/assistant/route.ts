import Anthropic from "@anthropic-ai/sdk";

import { ApiError, handle, readJson, requireOutletAccess, requireString } from "@/lib/api";
import { answerOffline } from "@/lib/assistant/offline";
import { runTool, TOOL_DEFS, type ToolContext } from "@/lib/assistant/tools";
import { formatDate, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

/**
 * AI assistant (module L). With ANTHROPIC_API_KEY set, Claude answers using
 * tool calls over the app's own data (so numbers are real). Without a key,
 * a rule-based fallback answers the common questions from the same tools.
 *
 * POST /api/assistant { outletId, messages: [{ role: "user"|"assistant", content }] }
 */

type ChatMessage = { role: "user" | "assistant"; content: string };

const MODEL = "claude-opus-5-5";

function systemPrompt(ctx: ToolContext) {
  return [
    `You are the WasteLess assistant for the restaurant outlet "${ctx.outletName}". Today is ${formatDate(today(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`,
    "Answer questions about sales, waste, forecasts, stock, orders and prep plans using the tools; never invent numbers. If a tool returns nothing, say so plainly.",
    "Be concise and practical for a busy restaurant owner: lead with the number, then one line of context. Use Indian rupees (₹) and plates as units.",
    "Reply in plain text: no markdown, no tables, no bold. Short paragraphs; a simple hyphen list only when comparing several dishes.",
  ].join("\n");
}

export const POST = handle(async (req: Request) => {
  const body = await readJson<{ outletId?: unknown; messages?: unknown }>(req);
  const outletId = requireString(body.outletId, "outletId");
  await requireOutletAccess(outletId);
  if (!Array.isArray(body.messages) || body.messages.length === 0) throw new ApiError("messages[] is required.");
  const history = (body.messages as ChatMessage[]).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-20);
  if (history[history.length - 1]?.role !== "user") throw new ApiError("The last message must be from the user.");

  const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: outletId }, select: { name: true } });
  const ctx: ToolContext = { outletId, outletName: outlet.name };

  if (!process.env.ANTHROPIC_API_KEY) {
    const answer = await answerOffline(ctx, history[history.length - 1].content);
    return Response.json({ reply: answer, mode: "offline", toolsUsed: [] });
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const toolsUsed: string[] = [];

  for (let turn = 0; turn < 6; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt(ctx),
      tools: TOOL_DEFS,
      messages,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ reply: "I can't help with that request.", mode: "claude", toolsUsed });
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content as Anthropic.ContentBlockParam[] });
      continue;
    }
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return Response.json({ reply: text || "I could not find an answer.", mode: "claude", toolsUsed });
    }

    messages.push({ role: "assistant", content: response.content as Anthropic.ContentBlockParam[] });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) {
      toolsUsed.push(t.name);
      let content: string;
      try {
        content = JSON.stringify(await runTool(ctx, t.name, (t.input ?? {}) as Record<string, unknown>));
      } catch (err) {
        content = JSON.stringify({ error: (err as Error).message });
      }
      results.push({ type: "tool_result", tool_use_id: t.id, content });
    }
    messages.push({ role: "user", content: results });
  }
  return Response.json({ reply: "That took too many steps; please ask a narrower question.", mode: "claude", toolsUsed });
});
