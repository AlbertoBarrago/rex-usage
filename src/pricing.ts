/**
 * Per-model list prices in USD per million tokens.
 * Sources:
 * - Anthropic first-party API rates (claude-api reference, cached 2026-10-06).
 * - OpenAI Standard tier, https://developers.openai.com/api/docs/pricing (fetched 2026-11-02).
 *   gpt-5.6-sol is on promotional pricing "at least through November 21, 2026".
 * Costs computed from these are estimates: Claude Code and Codex subscriptions are not billed per token.
 */
export interface ModelPrice {
  input: number;
  output: number;
  /** Explicit cache-read price; defaults to 10% of input when absent. */
  cacheRead?: number;
  /**
   * Higher rates applied to the whole request when its prompt (input + cache
   * reads + cache writes) exceeds `above` tokens. OpenAI prices >272K-token
   * prompts this way.
   */
  longContext?: { above: number; price: ModelPrice };
}

/** OpenAI's short/long context boundary. */
const OPENAI_LONG = 272_000;

function openai(short: ModelPrice, long: ModelPrice): ModelPrice {
  return { ...short, longContext: { above: OPENAI_LONG, price: long } };
}

/**
 * Ordered by prefix specificity: the first matching prefix wins, so longer
 * ids (e.g. `claude-opus-5-5`) must come before shorter ones (`claude-opus-5`).
 */
const PRICES: ReadonlyArray<readonly [prefix: string, price: ModelPrice]> = [
  ["claude-fable-5", { input: 10, output: 50, cacheRead: 0.25 }],
  ["claude-mythos-5", { input: 10, output: 50, cacheRead: 0.25 }],
  ["claude-opus-5-5", { input: 4, output: 20, cacheRead: 0.2 }],
  ["claude-opus-5", { input: 5, output: 25 }],
  ["claude-opus-4", { input: 5, output: 25 }],
  ["claude-sonnet-5", { input: 2, output: 10, cacheRead: 0.2 }],
  ["claude-sonnet-4", { input: 3, output: 15 }],
  ["claude-haiku-5", { input: 0.1, output: 0.5 }],
  ["claude-haiku-4", { input: 1, output: 5 }],
  ["gpt-6.1-sol", openai({ input: 2, output: 10, cacheRead: 0.1 }, { input: 4, output: 15, cacheRead: 0.2 })],
  ["gpt-6-astra", openai({ input: 10, output: 50, cacheRead: 1 }, { input: 20, output: 75, cacheRead: 2 })],
  ["gpt-6-luna", openai({ input: 0.1, output: 0.5, cacheRead: 0.01 }, { input: 0.2, output: 0.75, cacheRead: 0.02 })],
  ["gpt-5.6-sol", openai({ input: 4, output: 20, cacheRead: 0.4 }, { input: 8, output: 30, cacheRead: 0.8 })],
  ["gpt-5.6-terra", openai({ input: 2, output: 12, cacheRead: 0.2 }, { input: 4, output: 18, cacheRead: 0.4 })],
  ["gpt-5.5", openai({ input: 5, output: 30, cacheRead: 0.5 }, { input: 10, output: 45, cacheRead: 1 })],
  ["gpt-5.3-codex", { input: 1.75, output: 14, cacheRead: 0.175 }],
];

/** Cache write multipliers relative to the input price. */
const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

export function priceFor(model: string): ModelPrice | undefined {
  return PRICES.find(([prefix]) => model.startsWith(prefix))?.[1];
}

/** Returns the estimated USD cost, or `undefined` when the model is not priced. */
export function costOf(model: string, u: TokenUsage): number | undefined {
  const base = priceFor(model);
  if (!base) return undefined;
  const prompt = u.input + u.cacheRead + u.cacheWrite5m + u.cacheWrite1h;
  const p = base.longContext && prompt > base.longContext.above ? base.longContext.price : base;
  const cacheRead = p.cacheRead ?? p.input * 0.1;
  return (
    (u.input * p.input +
      u.output * p.output +
      u.cacheRead * cacheRead +
      u.cacheWrite5m * p.input * CACHE_WRITE_5M +
      u.cacheWrite1h * p.input * CACHE_WRITE_1H) /
    1_000_000
  );
}
