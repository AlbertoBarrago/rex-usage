import assert from "node:assert/strict";
import { test } from "node:test";
import {
  burnRate,
  cacheHitRatio,
  costByDay,
  groupBy,
  groupSessions,
  isLive,
  outputOverTime,
  since,
  totals,
} from "../src/aggregate.js";
import { bar, fmtDuration, shortId, sparkRows } from "../src/format.js";
import type { UsageRecord } from "../src/scan.js";

const NOW = new Date(2026, 10, 2, 15, 0).getTime();
const DAY = 86_400_000;

function rec(p: Partial<UsageRecord>): UsageRecord {
  return {
    key: Math.random().toString(), source: "claude", ts: NOW, model: "claude-opus-5-5", project: "a", sessionId: "s",
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

test("sparkRows and bar", () => {
  assert.deepEqual(sparkRows([0, 0], 1), ["▁▁"]);
  assert.deepEqual(sparkRows([0, 8], 1), ["▁█"]);
  // 2 rows: max fills both, half fills only the bottom row, tiny values keep one eighth.
  assert.deepEqual(sparkRows([16, 8, 1, 0], 2), ["█   ", "██▁▁"]);
  assert.equal(bar(1, 4), "████");
  assert.equal(bar(0, 4), "····");
});

test("groupSessions: span, latest project, most recent first", () => {
  const ss = groupSessions([
    rec({ sessionId: "old", ts: NOW - DAY, cost: 5 }),
    rec({ sessionId: "new", ts: NOW - 3_600_000, project: "a", cost: 1, model: "claude-haiku-5-5" }),
    rec({ sessionId: "new", ts: NOW, project: "b", cost: 2 }),
  ]);
  assert.deepEqual(ss.map((s) => s.id), ["new", "old"]);
  const s = ss[0]!;
  assert.equal(s.start, NOW - 3_600_000);
  assert.equal(s.end, NOW);
  assert.equal(s.project, "b");
  assert.equal(s.cost, 3);
  assert.equal(s.models.size, 2);
  assert.equal(burnRate(s), 3);
  assert.equal(isLive(s, NOW + 60_000), true);
  assert.equal(isLive(s, NOW + 10 * 60_000), false);
});

test("burnRate clamps sub-minute sessions to one minute", () => {
  const [s] = groupSessions([rec({ cost: 1 })]);
  assert.equal(burnRate(s!), 60);
});

test("outputOverTime buckets the session span, end inclusive", () => {
  const rs = [rec({ ts: 0, output: 1 }), rec({ ts: 50, output: 2 }), rec({ ts: 100, output: 4 })];
  assert.deepEqual(outputOverTime(rs, 0, 100, 4), [1, 0, 2, 4]);
  assert.deepEqual(outputOverTime([rec({ ts: 5, output: 3 })], 5, 5, 3), [3, 0, 0]);
});

test("fmtDuration and shortId", () => {
  assert.equal(fmtDuration(42_000), "42s");
  assert.equal(fmtDuration(17 * 60_000), "17m");
  assert.equal(fmtDuration(72 * 60_000), "1h12m");
  assert.equal(fmtDuration(76 * 3_600_000), "3d4h");
  assert.equal(shortId("3f9a1c2e-0000"), "3f9a1c2e");
  assert.equal(shortId(""), "unknown");
});
