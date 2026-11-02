import type { UsageRecord } from "./scan.js";

export interface Totals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  /** Records whose model has no known price. */
  unpriced: number;
  messages: number;
}

export interface Group extends Totals {
  name: string;
  models: Set<string>;
}

const DAY_MS = 86_400_000;

function empty(): Totals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, unpriced: 0, messages: 0 };
}

function add(t: Totals, r: UsageRecord): void {
  t.input += r.input;
  t.output += r.output;
  t.cacheRead += r.cacheRead;
  t.cacheWrite += r.cacheWrite5m + r.cacheWrite1h;
  if (r.cost === undefined) t.unpriced++;
  else t.cost += r.cost;
  t.messages++;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Records within the last `days` calendar days (today included); `null` keeps everything. */
export function since(records: UsageRecord[], days: number | null, now = Date.now()): UsageRecord[] {
  if (days === null) return records;
  const from = startOfDay(now) - (days - 1) * DAY_MS;
  return records.filter((r) => r.ts >= from);
}

export function totals(records: UsageRecord[]): Totals {
  const t = empty();
  for (const r of records) add(t, r);
  return t;
}

/** Share of prompt tokens served from cache. */
export function cacheHitRatio(t: Totals): number {
  const prompt = t.input + t.cacheRead + t.cacheWrite;
  return prompt === 0 ? 0 : t.cacheRead / prompt;
}

export function groupBy(records: UsageRecord[], key: (r: UsageRecord) => string): Group[] {
  const map = new Map<string, Group>();
  for (const r of records) {
    const name = key(r);
    let g = map.get(name);
    if (!g) {
      g = { ...empty(), name, models: new Set() };
      map.set(name, g);
    }
    add(g, r);
    g.models.add(r.model);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost || b.output - a.output);
}

/** Cost per calendar day, oldest first, `days` buckets ending today. */
export function costByDay(records: UsageRecord[], days: number, now = Date.now()): number[] {
  const today = startOfDay(now);
  const buckets = new Array<number>(days).fill(0);
  for (const r of records) {
    const idx = days - 1 - Math.round((today - startOfDay(r.ts)) / DAY_MS);
    if (idx >= 0 && idx < days) buckets[idx]! += r.cost ?? 0;
  }
  return buckets;
}

/** Output tokens per hour of the current day (24 buckets). */
export function outputByHourToday(records: UsageRecord[], now = Date.now()): number[] {
  const today = startOfDay(now);
  const buckets = new Array<number>(24).fill(0);
  for (const r of records) {
    if (r.ts < today || r.ts >= today + DAY_MS) continue;
    buckets[new Date(r.ts).getHours()]! += r.output;
  }
  return buckets;
}
