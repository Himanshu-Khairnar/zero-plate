import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "./__fixtures__/nlp-regression.json";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/assistant/tools", () => ({
  outletVocabulary: vi.fn(async () => ({ dishes: ["Paneer Tikka", "Chicken Biryani"], ingredients: ["Paneer", "Milk"] })),
  wasteSummary: vi.fn(async (_ctx: unknown, days: number) => ({ days, entries: 2, totalCost: 900, byReason: { spoilage: 3 }, top: [{ name: "Paneer Tikka", qty: 3, cost: 900 }] })),
  salesSummary: vi.fn(async (_ctx: unknown, days: number) => ({ days, plates: 70, revenue: 14000, perDay: 10, top: [{ name: "Chicken Biryani", plates: 40, revenue: 10400 }] })),
  forecastFor: vi.fn(async (_ctx: unknown, start: string | undefined, days: number) => ({ start: start ?? "2026-10-26", days, rows: [{ date: start ?? "2026-10-26", dish: "Chicken Biryani", low: 30, likely: 36, high: 42, why: "Weekend lift." }] })),
  stockLevels: vi.fn(async () => [{ ingredient: "Paneer", unit: "kg", onHand: 4, nextExpiry: null, costPerUnit: 420 }]),
  orderSuggestion: vi.fn(async (_ctx: unknown, ingredient: string, days: number) => ({ ingredient, unit: "kg", onHand: 1, needForDays: days, need: 5, suggestedOrder: 4, basis: "" })),
  prepPlanFor: vi.fn(async (_ctx: unknown, date?: string) => ({ date: date ?? "2026-10-26", status: "not drafted yet" })),
}));

const tools = await import("@/lib/assistant/tools");
const { answerOffline, ruleIntent } = await import("./offline");
const { isNlpParse, parseQuestion, resetNlpCircuit, shouldUseNlp } = await import("./nlp");
type NlpParse = import("./nlp").NlpParse;

const ctx = { outletId: "o1", outletName: "Bandra Branch" };

function parse(intent: string, confidence: number, slots: Partial<NlpParse["resolved"]> = {}): NlpParse {
  return {
    intent,
    confidence,
    intentScores: { [intent]: confidence },
    entities: [],
    resolved: { intent, dish: null, ingredient: null, date: null, qty: null, unit: null, ...slots },
    language: "en",
    normalizedText: "",
    corrections: [],
    debug: { threshold: 0.4 },
  };
}

const day = (offset: number, days = 1, direction: "past" | "present" | "future" = offset < 0 ? "past" : offset > 0 ? "future" : "present") => ({
  text: "x",
  value: { kind: days > 1 ? ("range" as const) : ("day" as const), offset, days, direction, start: "", end: "", label: "x" },
});

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const f = vi.fn(impl);
  vi.stubGlobal("fetch", f);
  return f;
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  resetNlpCircuit();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("NLP client", () => {
  it("returns a validated parse", async () => {
    mockFetch(() => json(parse("waste", 0.9)));
    expect((await parseQuestion({ text: "aaj kitna waste hua" }))?.intent).toBe("waste");
  });

  it("returns null on timeout without waiting for the server", async () => {
    mockFetch((_url, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    const t = Date.now();
    expect(await parseQuestion({ text: "x" }, 50)).toBeNull();
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it("returns null on HTTP errors and malformed JSON, then backs off", async () => {
    mockFetch(() => json({ detail: "boom" }, 500));
    expect(await parseQuestion({ text: "x" })).toBeNull();
    const f = mockFetch(() => json(parse("waste", 0.9)));
    expect(await parseQuestion({ text: "x" })).toBeNull(); // circuit open: no request at all
    expect(f).not.toHaveBeenCalled();
    resetNlpCircuit();
    mockFetch(() => Promise.resolve(new Response("<html>sleeping</html>", { status: 200 })));
    expect(await parseQuestion({ text: "x" })).toBeNull();
    expect(isNlpParse({ intent: "waste" })).toBe(false);
  });

  it("uses a parse only when confident and answerable", () => {
    expect(shouldUseNlp(parse("waste", 0.9))).toBe(true);
    expect(shouldUseNlp(parse("waste", 0.2))).toBe(false);
    expect(shouldUseNlp(parse("help", 0.99))).toBe(false);
    expect(shouldUseNlp(parse("purchase", 0.9))).toBe(false); // no ingredient
    expect(shouldUseNlp(parse("purchase", 0.9, { ingredient: { text: "paneer", value: "Paneer" } }))).toBe(true);
  });
});

describe("answerOffline routing", () => {
  it("routes a Hinglish purchase question with a date to suggest_order", async () => {
    mockFetch(() => json(parse("purchase", 0.8, { ingredient: { text: "panner", value: "Paneer" }, date: day(1) })));
    const a = await answerOffline(ctx, "kal kitna panner chahiye");
    expect(tools.orderSuggestion).toHaveBeenCalledWith(ctx, "Paneer", 1);
    expect(a).toContain("of Paneer; you have 1 kg on hand, so order about 4 kg"); // same phrasing as the rules
  });

  it("maps 'kal' (past) to a 2-day waste window like the rules' 'yesterday'", async () => {
    mockFetch(() => json(parse("waste", 0.87, { date: day(-1) })));
    await answerOffline(ctx, "kal kitna waste hua");
    expect(tools.wasteSummary).toHaveBeenCalledWith(ctx, 2, undefined);
  });

  it("passes the dish filter and future date to the forecast", async () => {
    mockFetch(() => json(parse("forecast", 0.7, { dish: { text: "biryani", value: "Chicken Biryani" }, date: day(2) })));
    await answerOffline(ctx, "aur parso?", [{ role: "user", content: "kal kitni biryani bikegi" }, { role: "assistant", content: "..." }]);
    const [, start, days, dish] = vi.mocked(tools.forecastFor).mock.calls[0];
    expect([typeof start, days, dish]).toEqual(["string", 1, "Chicken Biryani"]);
  });

  it("sends history and the outlet menu to the parser", async () => {
    const f = mockFetch(() => json(parse("stock", 0.9, { ingredient: { text: "milk", value: "Milk" } })));
    await answerOffline(ctx, "and milk?", [{ role: "user", content: "how much paneer do we have" }]);
    const body = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(body.history).toEqual([{ role: "user", text: "how much paneer do we have" }]);
    expect(body.dishes).toContain("Paneer Tikka");
    expect(tools.stockLevels).toHaveBeenCalledWith(ctx, "Milk");
  });

  it("falls back to the keyword rules when the service is down", async () => {
    mockFetch(() => Promise.reject(new Error("ECONNREFUSED")));
    await answerOffline(ctx, "Buy some paneer for this weekend");
    expect(tools.orderSuggestion).toHaveBeenCalledWith(ctx, "paneer", 3);
  });

  it("falls back to the rules on low confidence and help intents", async () => {
    mockFetch(() => json(parse("sales", 0.2)));
    await answerOffline(ctx, "Which dish did we waste most last month?");
    expect(tools.wasteSummary).toHaveBeenCalledWith(ctx, 30, undefined);
    expect(tools.salesSummary).not.toHaveBeenCalled();
    mockFetch(() => json(parse("help", 0.95)));
    expect(await answerOffline(ctx, "hello")).toContain("I can answer questions");
  });
});

describe("regression set (recorded parses of every dataset question)", () => {
  const category = (i: string) => (i === "help" || i === "unknown" || i === "fallback" ? "fallback" : i);

  it("the TypeScript rules match the Python port used in the evaluation", () => {
    for (const r of fixture.rows) expect([r.q, ruleIntent(r.q)]).toEqual([r.q, r.pyRegex]);
  });

  it("never changes the intent of a question the rules already answer correctly", () => {
    let regressions = 0;
    let improved = 0;
    for (const r of fixture.rows) {
      const p = parse(r.nlpIntent, r.confidence, r.hasIngredient ? { ingredient: { text: "x", value: "X" } } : {});
      p.debug = { threshold: fixture.threshold };
      const combined = shouldUseNlp(p) ? r.nlpIntent : ruleIntent(r.q);
      const rulesOk = category(ruleIntent(r.q)) === category(r.gold);
      const combinedOk = category(combined) === category(r.gold);
      if (rulesOk && !combinedOk) regressions++;
      if (!rulesOk && combinedOk) improved++;
    }
    expect(regressions).toBe(0);
    expect(improved).toBeGreaterThan(100);
  });
});
