import "server-only";

import type { ChatMessage } from "@/lib/assistant/chat";
import { parseQuestion, shouldUseNlp, type NlpDate, type NlpParse } from "@/lib/assistant/nlp";
import { addDays, formatDate, today, tomorrow } from "@/lib/dates";
import { inr } from "@/lib/format";
import { forecastFor, orderSuggestion, outletVocabulary, prepPlanFor, salesSummary, stockLevels, wasteSummary, type ToolContext } from "@/lib/assistant/tools";

/**
 * Assistant used when no ANTHROPIC_API_KEY is configured.
 *
 * 1. The question (with recent history and the outlet's dish / ingredient
 *    names) goes to the NLP parser of the ML service (backend/app/nlp):
 *    Hinglish, spelling mistakes, dates like "kal" / "next friday" and
 *    follow-ups like "and tomorrow?" are understood there. If it answers
 *    quickly with a confident intent, we route on its intent and slots to
 *    the same data tools the LLM uses.
 * 2. Otherwise (service asleep or down, timeout, low confidence, help /
 *    unknown) the original keyword rules below answer, exactly as before.
 */

const DAY_WORDS: [RegExp, number][] = [
  [/\b(today)\b/i, 1],
  [/\b(yesterday)\b/i, 2],
  [/\b(this|last|past)\s+week\b|\b7\s*days\b/i, 7],
  [/\bweekend\b/i, 3],
  [/\b(this|last|past)\s+month\b|\b30\s*days\b/i, 30],
  [/\b(\d+)\s*days?\b/i, -1],
];

function windowDays(q: string, fallback: number): number {
  for (const [re, d] of DAY_WORDS) {
    const m = q.match(re);
    if (m) return d === -1 ? Math.min(90, Number(m[1])) : d;
  }
  return fallback;
}

function reasonLabel(r: string) {
  const labels: Record<string, string> = { overproduction: "over-production", spoilage: "spoilage", plate_waste: "plate waste", prep_loss: "prep loss" };
  return labels[r] ?? r;
}

// --------------------------------------------------------------------------- answers (shared)

async function wasteAnswer(ctx: ToolContext, days: number, dish?: string): Promise<string> {
  const r = await wasteSummary(ctx, days, dish);
  if (r.entries === 0) return `No waste has been logged${dish ? ` for ${dish}` : ""} at ${ctx.outletName} in the last ${days} days.`;
  const top = r.top[0];
  const reasons = Object.entries(r.byReason).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${reasonLabel(k)} ${Math.round(v)}`).join(", ");
  return `In the last ${days} days ${ctx.outletName} logged ${r.entries} waste entries costing about ${inr(r.totalCost)}. The most wasted dish was ${top.name} (${top.qty} plates, ${inr(top.cost)}). By reason: ${reasons}.`;
}

async function forecastAnswer(ctx: ToolContext, start: string | undefined, days: number, dish?: string): Promise<string> {
  const r = await forecastFor(ctx, start, days, dish);
  if (r.rows.length === 0) return `There is no forecast stored yet for ${formatDate(start ?? tomorrow())}. Generate one from the Forecasts page.`;
  if (days === 1) {
    const total = r.rows.reduce((s, x) => s + x.likely, 0);
    const lines = r.rows.slice(0, 6).map((x) => `${x.dish} ~${x.likely} (${x.low}–${x.high})`).join("; ");
    const when = r.start === tomorrow() ? "Tomorrow" : r.start === today() ? "Today" : "On";
    return `${when} (${formatDate(r.start)}) the model expects about ${total} plates in total. Top dishes: ${lines}. ${r.rows[0].why}`;
  }
  const byDay = new Map<string, number>();
  for (const x of r.rows) byDay.set(x.date, (byDay.get(x.date) ?? 0) + x.likely);
  return `Expected plates over the next ${days} days: ${[...byDay.entries()].map(([d, v]) => `${formatDate(d, { weekday: "short" })} ${v}`).join(", ")}.`;
}

async function prepAnswer(ctx: ToolContext, date?: string): Promise<string> {
  const r = await prepPlanFor(ctx, date);
  const isTomorrow = !date || date === tomorrow();
  if (r.status === "not drafted yet") {
    return `${isTomorrow ? "Tomorrow's prep plan" : `The prep plan for ${formatDate(r.date)}`} has not been drafted yet. Open the Daily Prep Plan page and it will be built from the forecast.`;
  }
  const items = (r.items ?? []).slice(0, 8).map((i) => `${i.dish} ${i.plates}`).join(", ");
  return `${isTomorrow ? "Tomorrow's plan" : `The plan for ${formatDate(r.date)}`} is ${r.status.toLowerCase()}${r.approvedBy ? ` (approved by ${r.approvedBy})` : ""}: ${items}.`;
}

async function stockAnswer(ctx: ToolContext, ingredient?: string): Promise<string> {
  const rows = await stockLevels(ctx, ingredient);
  if (rows.length === 0) return "No matching ingredients found.";
  const low = rows.filter((r) => r.onHand <= 0);
  const text = rows.slice(0, 8).map((r) => `${r.ingredient} ${r.onHand} ${r.unit}${r.nextExpiry ? ` (expires ${formatDate(r.nextExpiry)})` : ""}`).join("; ");
  return `${text}.${low.length ? ` Out of stock: ${low.map((r) => r.ingredient).join(", ")}.` : ""}`;
}

async function salesAnswer(ctx: ToolContext, days: number, dish?: string): Promise<string> {
  const r = await salesSummary(ctx, days, dish);
  if (r.plates === 0) return `No sales recorded${dish ? ` for ${dish}` : ""} in the last ${days} days.`;
  return `In the last ${days} days ${ctx.outletName} sold ${r.plates} plates${dish ? ` of ${dish}` : ""} (about ${r.perDay} a day) for ${inr(r.revenue)}. Top sellers: ${r.top.map((t) => `${t.name} ${t.plates}`).join(", ")}.`;
}

async function orderAnswer(ctx: ToolContext, ingredient: string, days: number): Promise<string> {
  const r = await orderSuggestion(ctx, ingredient, days);
  if ("error" in r) return r.error ?? "No matching ingredient.";
  return `For the next ${days} day${days === 1 ? "" : "s"} you need about ${r.need} ${r.unit} of ${r.ingredient}; you have ${r.onHand} ${r.unit} on hand, so order about ${r.suggestedOrder} ${r.unit}. (Based on the high forecast × recipe quantity, minus stock.)`;
}

// --------------------------------------------------------------------------- keyword rules (original behaviour)

export type RuleIntent = "purchase" | "waste" | "forecast" | "prep" | "stock" | "sales" | "fallback";

const PURCHASE_NAME = /(?:order|buy|purchase|of)\s+(?:some\s+)?([a-z][a-z ]{2,30}?)(?:\s+for|\s+this|\s+next|\?|$)/;

/** Which branch of the keyword cascade answers `question` ("fallback" = the help text). */
export function ruleIntent(question: string): RuleIntent {
  const lower = question.trim().toLowerCase();
  if (/\b(order|buy|purchase|stock up)\b/.test(lower) && lower.match(PURCHASE_NAME)?.[1]?.trim()) return "purchase";
  if (/\bwaste|wasted|throw|leftover/.test(lower)) return "waste";
  if (/\bforecast|expect|predict|demand|how many .* (sell|tomorrow)/.test(lower)) return "forecast";
  if (/\bprep|plan|cook\b/.test(lower)) return "prep";
  if (/\bstock|inventory|left|have\b.*\b(kg|litre|pieces)|expir/.test(lower)) return "stock";
  if (/\bsales|sold|revenue|best.?sell|popular|earn/.test(lower)) return "sales";
  return "fallback";
}

export function helpText(ctx: ToolContext): string {
  return `I can answer questions about waste, sales, forecasts, stock, orders and the prep plan for ${ctx.outletName}. Try "Which dish did we waste most last month?", "How much paneer should I order for the weekend?" or "What do we expect to sell tomorrow?".`;
}

export async function answerByRules(ctx: ToolContext, question: string): Promise<string> {
  const lower = question.trim().toLowerCase();
  switch (ruleIntent(question)) {
    case "purchase":
      return orderAnswer(ctx, lower.match(PURCHASE_NAME)![1].trim(), windowDays(lower, 2));
    case "waste":
      return wasteAnswer(ctx, windowDays(lower, 30));
    case "forecast": {
      const days = /\bweek\b/.test(lower) ? 7 : 1;
      const dishMatch = lower.match(/(?:of|for)\s+([a-z][a-z ]{2,30}?)(?:\s+tomorrow|\s+this|\s+next|\?|$)/);
      return forecastAnswer(ctx, undefined, days, dishMatch?.[1]?.trim());
    }
    case "prep":
      return prepAnswer(ctx);
    case "stock": {
      const m = lower.match(/(?:of|much)\s+([a-z][a-z ]{2,30}?)(?:\s+do|\s+is|\s+left|\?|$)/);
      return stockAnswer(ctx, m?.[1]?.trim());
    }
    case "sales":
      return salesAnswer(ctx, windowDays(lower, 7));
    default:
      return helpText(ctx);
  }
}

// --------------------------------------------------------------------------- NLP routing

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/** Look-back window for "last week" / "kal" (past) questions; matches the rules ("yesterday" = 2 days). */
export function pastWindow(date: NlpDate | null | undefined, fallback: number): number {
  if (!date || date.direction === "future") return fallback;
  return clamp(1 - date.offset, 1, 90);
}

/** Days of demand to cover from tomorrow up to the end of a future date ("next friday", "weekend"). */
export function coverDays(date: NlpDate | null | undefined, fallback: number): number {
  if (!date || date.direction === "past") return fallback;
  return clamp(date.offset + date.days - 1, 1, 14);
}

const slotName = (s: { text: string; value: unknown } | null | undefined) =>
  s ? (typeof s.value === "string" && s.value ? s.value : s.text.trim()) || undefined : undefined;

/** Answer from a confident parse; null when the parse does not map to a data question. */
export async function answerFromParse(ctx: ToolContext, p: NlpParse): Promise<string | null> {
  const r = p.resolved;
  const date = r.date?.value ?? null;
  const dish = slotName(r.dish);
  const ingredient = slotName(r.ingredient);
  switch (p.intent) {
    case "waste":
      return wasteAnswer(ctx, pastWindow(date, 30), dish);
    case "sales":
      return salesAnswer(ctx, pastWindow(date, 7), dish);
    case "forecast": {
      if (date && date.direction !== "past") {
        const start = addDays(today(), Math.max(0, date.offset));
        return forecastAnswer(ctx, start, clamp(date.days, 1, 7), dish);
      }
      return forecastAnswer(ctx, undefined, 1, dish);
    }
    case "prep":
      return prepAnswer(ctx, date && date.offset >= 0 ? addDays(today(), date.offset) : undefined);
    case "stock":
      return stockAnswer(ctx, ingredient);
    case "purchase":
      return ingredient ? orderAnswer(ctx, ingredient, coverDays(date, 2)) : null;
    default:
      return null;
  }
}

function toNlpHistory(history: ChatMessage[]) {
  return history.slice(-6).map((m) => ({ role: m.role, text: m.content.slice(0, 500) }));
}

export async function answerOffline(ctx: ToolContext, question: string, history: ChatMessage[] = []): Promise<string> {
  let parsed: NlpParse | null = null;
  try {
    const vocab = await outletVocabulary(ctx);
    parsed = await parseQuestion({ text: question.slice(0, 2000), history: toNlpHistory(history), outletId: ctx.outletId, ...vocab });
  } catch {
    parsed = null;
  }
  if (parsed && shouldUseNlp(parsed)) {
    const answer = await answerFromParse(ctx, parsed);
    if (answer) return answer;
  }
  return answerByRules(ctx, question);
}
