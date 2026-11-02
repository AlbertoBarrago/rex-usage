/**
 * Per-model list prices in USD per million tokens.
 * Source: Anthropic first-party API rates (claude-api reference, cached 2026-10-06).
 * Costs computed from these are estimates: Claude Code subscriptions are not billed per token.
 */
export interface ModelPrice {
  input: number;
  output: number;
  /** Explicit cache-read price; defaults to 10% of input when absent. */
  cacheRead?: number;
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
  const p = priceFor(model);
  if (!p) return undefined;
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
