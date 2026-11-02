import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheHitRatio, costByDay, groupBy, since, totals } from "../src/aggregate.js";
import { bar, sparkline } from "../src/format.js";
import type { UsageRecord } from "../src/scan.js";

const NOW = new Date(2026, 10, 2, 15, 0).getTime();
const DAY = 86_400_000;

function rec(p: Partial<UsageRecord>): UsageRecord {
  return {
    key: Math.random().toString(), ts: NOW, model: "claude-opus-5-5", project: "a", sessionId: "s",
    input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, cost: 0, ...p,
  };
}

test("since keeps calendar days including today", () => {
  const rs = [rec({ ts: NOW }), rec({ ts: NOW - DAY }), rec({ ts: NOW - 7 * DAY })];
  assert.equal(since(rs, 1, NOW).length, 1);
  assert.equal(since(rs, 7, NOW).length, 2);
  assert.equal(since(rs, null, NOW).length, 3);
});

test("totals, cache ratio and unpriced count", () => {
  const t = totals([rec({ input: 10, cacheRead: 80, cacheWrite1h: 10, cost: 1 }), rec({ cost: undefined })]);
  assert.equal(t.cost, 1);
  assert.equal(t.unpriced, 1);
  assert.equal(cacheHitRatio(t), 0.8);
});

test("groupBy sorts by cost desc", () => {
  const g = groupBy([rec({ project: "a", cost: 1 }), rec({ project: "b", cost: 3 }), rec({ project: "a", cost: 1 })], (r) => r.project);
  assert.deepEqual(g.map((x) => [x.name, x.cost]), [["b", 3], ["a", 2]]);
});

test("costByDay buckets oldest first", () => {
  assert.deepEqual(costByDay([rec({ cost: 2 }), rec({ ts: NOW - 2 * DAY, cost: 1 })], 3, NOW), [1, 0, 2]);
});

test("sparkline and bar", () => {
  assert.equal(sparkline([0, 0]), "▁▁");
  assert.equal(sparkline([0, 7]), "▁█");
  assert.equal(bar(1, 4), "████");
  assert.equal(bar(0, 4), "····");
});
