import "server-only";

/**
 * Client for the NLP parser of the Python ML service (POST /api/nlp/parse,
 * backend/app/nlp). Used only by the offline assistant (no ANTHROPIC_API_KEY).
 *
 * It must never make the assistant slower or less reliable than the regex
 * rules it sits in front of:
 * - hard timeout (1.5 s, AbortController); the free-tier service may be asleep;
 * - any error, non-200 or malformed JSON -> null (caller uses the rules);
 * - after a failure the parser is skipped for 30 s while a non-awaited
 *   warm-up request wakes the service, so a cold start costs at most one
 *   timeout per 30 s, never a long wait;
 * - the answer is used only above a confidence threshold that was tuned so
 *   that no question the rules answer correctly changes intent
 *   (docs/nlp/results.md, "Routing policy").
 */

export const NLP_TIMEOUT_MS = 1500;
export const NLP_RETRY_AFTER_MS = 30_000;
export const DEFAULT_NLP_THRESHOLD = 0.4;
const ANSWERABLE = new Set(["waste", "forecast", "prep", "stock", "sales", "purchase"]);

export type NlpDate = { kind: "day" | "range"; offset: number; days: number; direction: "past" | "present" | "future"; start: string; end: string; label: string };
export type NlpSlot<V = unknown> = { text: string; value: V | null } | null;
export type NlpParse = {
  intent: string;
  confidence: number;
  intentScores: Record<string, number>;
  entities: { type: string; text: string; value: unknown; start: number; end: number }[];
  resolved: {
    intent: string;
    dish: NlpSlot<string>;
    ingredient: NlpSlot<string>;
    date: NlpSlot<NlpDate>;
    qty: NlpSlot<number>;
    unit: NlpSlot<string>;
  };
  language: string;
  normalizedText: string;
  corrections: { from: string; to: string }[];
  debug?: { threshold?: number; [k: string]: unknown };
};

export type NlpRequest = {
  text: string;
  history?: { role: "user" | "assistant"; text: string }[];
  outletId?: string;
  dishes?: string[];
  ingredients?: string[];
};

let skipUntil = 0;

function baseUrl(): string {
  return process.env.ML_SERVICE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

/** Test hook: forget a previous failure. */
export function resetNlpCircuit(): void {
  skipUntil = 0;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isSlot(x: unknown): boolean {
  return x === null || x === undefined || (isObj(x) && typeof x.text === "string");
}

/** Shape check, so a malformed response can never reach the answer code. */
export function isNlpParse(x: unknown): x is NlpParse {
  if (!isObj(x) || typeof x.intent !== "string" || typeof x.confidence !== "number" || !Number.isFinite(x.confidence)) return false;
  const r = x.resolved;
  if (!isObj(r) || typeof r.intent !== "string") return false;
  if (!["dish", "ingredient", "date", "qty", "unit"].every((k) => isSlot(r[k]))) return false;
  const d = r.date;
  if (isObj(d) && d.value !== null && d.value !== undefined) {
    const v = d.value;
    if (!isObj(v) || typeof v.offset !== "number" || typeof v.days !== "number" || typeof v.direction !== "string") return false;
  }
  return Array.isArray(x.entities);
}

function warmUp(): void {
  // Fire and forget: wakes a sleeping free-tier instance for the next question.
  void fetch(`${baseUrl()}/api/nlp/health`, { cache: "no-store" }).catch(() => {});
}

/** Parse a question with the NLP service; null whenever it is not quickly and validly available. */
export async function parseQuestion(body: NlpRequest, timeoutMs = NLP_TIMEOUT_MS): Promise<NlpParse | null> {
  if (process.env.NLP_DISABLED === "1" || Date.now() < skipUntil) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl()}/api/nlp/parse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json: unknown = await res.json();
    if (!isNlpParse(json)) throw new Error("malformed response");
    return json;
  } catch {
    skipUntil = Date.now() + NLP_RETRY_AFTER_MS;
    warmUp();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Use the parse only when it is confident and leads to a data answer. */
export function shouldUseNlp(p: NlpParse): boolean {
  const t = p.debug?.threshold;
  const threshold = typeof t === "number" && t > 0 && t < 1 ? t : DEFAULT_NLP_THRESHOLD;
  if (p.confidence < threshold || !ANSWERABLE.has(p.intent)) return false;
  return p.intent !== "purchase" || !!p.resolved.ingredient;
}
