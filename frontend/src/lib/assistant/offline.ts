import "server-only";

import { formatDate, tomorrow } from "@/lib/dates";
import { inr } from "@/lib/format";
import { forecastFor, orderSuggestion, prepPlanFor, salesSummary, stockLevels, wasteSummary, type ToolContext } from "@/lib/assistant/tools";

/**
 * Rule-based assistant used when no ANTHROPIC_API_KEY is configured.
 * It understands the common questions from the plan ("which dish did we
 * waste most last month?", "how much paneer should I order for the
 * weekend?") by matching intent words and calling the same data tools the
 * LLM uses, so the demo works fully offline.
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

export async function answerOffline(ctx: ToolContext, question: string): Promise<string> {
  const q = question.trim();
  const lower = q.toLowerCase();

  if (/\b(order|buy|purchase|stock up)\b/.test(lower)) {
    const m = lower.match(/(?:order|buy|purchase|of)\s+(?:some\s+)?([a-z][a-z ]{2,30}?)(?:\s+for|\s+this|\s+next|\?|$)/);
    const name = m?.[1]?.trim();
    if (name) {
      const days = windowDays(lower, 2);
      const r = await orderSuggestion(ctx, name, days);
      if ("error" in r) return r.error ?? "No matching ingredient.";
      return `For the next ${days} day${days === 1 ? "" : "s"} you need about ${r.need} ${r.unit} of ${r.ingredient}; you have ${r.onHand} ${r.unit} on hand, so order about ${r.suggestedOrder} ${r.unit}. (Based on the high forecast × recipe quantity, minus stock.)`;
    }
  }

  if (/\bwaste|wasted|throw|leftover/.test(lower)) {
    const days = windowDays(lower, 30);
    const r = await wasteSummary(ctx, days);
    if (r.entries === 0) return `No waste has been logged at ${ctx.outletName} in the last ${days} days.`;
    const top = r.top[0];
    const reasons = Object.entries(r.byReason).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${reasonLabel(k)} ${Math.round(v)}`).join(", ");
    return `In the last ${days} days ${ctx.outletName} logged ${r.entries} waste entries costing about ${inr(r.totalCost)}. The most wasted dish was ${top.name} (${top.qty} plates, ${inr(top.cost)}). By reason: ${reasons}.`;
  }

  if (/\bforecast|expect|predict|demand|how many .* (sell|tomorrow)/.test(lower)) {
    const days = /\bweek\b/.test(lower) ? 7 : 1;
    const dishMatch = lower.match(/(?:of|for)\s+([a-z][a-z ]{2,30}?)(?:\s+tomorrow|\s+this|\s+next|\?|$)/);
    const r = await forecastFor(ctx, undefined, days, dishMatch?.[1]?.trim());
    if (r.rows.length === 0) return `There is no forecast stored yet for ${formatDate(tomorrow())}. Generate one from the Forecasts page.`;
    if (days === 1) {
      const total = r.rows.reduce((s, x) => s + x.likely, 0);
      const lines = r.rows.slice(0, 6).map((x) => `${x.dish} ~${x.likely} (${x.low}–${x.high})`).join("; ");
      return `Tomorrow (${formatDate(r.start)}) the model expects about ${total} plates in total. Top dishes: ${lines}. ${r.rows[0].why}`;
    }
    const byDay = new Map<string, number>();
    for (const x of r.rows) byDay.set(x.date, (byDay.get(x.date) ?? 0) + x.likely);
    return `Expected plates over the next 7 days: ${[...byDay.entries()].map(([d, v]) => `${formatDate(d, { weekday: "short" })} ${v}`).join(", ")}.`;
  }

  if (/\bprep|plan|cook\b/.test(lower)) {
    const r = await prepPlanFor(ctx);
    if (r.status === "not drafted yet") return `Tomorrow's prep plan has not been drafted yet. Open the Daily Prep Plan page and it will be built from the forecast.`;
    const items = (r.items ?? []).slice(0, 8).map((i) => `${i.dish} ${i.plates}`).join(", ");
    return `Tomorrow's plan is ${r.status.toLowerCase()}${r.approvedBy ? ` (approved by ${r.approvedBy})` : ""}: ${items}.`;
  }

  if (/\bstock|inventory|left|have\b.*\b(kg|litre|pieces)|expir/.test(lower)) {
    const m = lower.match(/(?:of|much)\s+([a-z][a-z ]{2,30}?)(?:\s+do|\s+is|\s+left|\?|$)/);
    const rows = await stockLevels(ctx, m?.[1]?.trim());
    if (rows.length === 0) return "No matching ingredients found.";
    const low = rows.filter((r) => r.onHand <= 0);
    const text = rows.slice(0, 8).map((r) => `${r.ingredient} ${r.onHand} ${r.unit}${r.nextExpiry ? ` (expires ${formatDate(r.nextExpiry)})` : ""}`).join("; ");
    return `${text}.${low.length ? ` Out of stock: ${low.map((r) => r.ingredient).join(", ")}.` : ""}`;
  }

  if (/\bsales|sold|revenue|best.?sell|popular|earn/.test(lower)) {
    const days = windowDays(lower, 7);
    const r = await salesSummary(ctx, days);
    if (r.plates === 0) return `No sales recorded in the last ${days} days.`;
    return `In the last ${days} days ${ctx.outletName} sold ${r.plates} plates (about ${r.perDay} a day) for ${inr(r.revenue)}. Top sellers: ${r.top.map((t) => `${t.name} ${t.plates}`).join(", ")}.`;
  }

  return `I can answer questions about waste, sales, forecasts, stock, orders and the prep plan for ${ctx.outletName}. Try "Which dish did we waste most last month?", "How much paneer should I order for the weekend?" or "What do we expect to sell tomorrow?".`;
}
