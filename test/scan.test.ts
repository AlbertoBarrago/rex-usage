import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { costOf } from "../src/pricing.js";
import { claudeSource, Scanner } from "../src/scan.js";

const ROOT = join(import.meta.dirname, "fixtures", "projects");

test("scanner dedups streamed messages, reads subagents, counts malformed lines", async () => {
  const res = await new Scanner([claudeSource(ROOT)]).scan(Date.parse("2030-01-01"));
  assert.equal(res.skipped, 1);
  assert.equal(res.records.length, 2);
  const m1 = res.records.find((r) => r.key === "m1:r1");
  assert.ok(m1);
  assert.equal(m1.output, 1_000_000, "keeps the last write of a streamed message");
  assert.equal(m1.project, "demo");
  // opus-5-5: 4 in + 20 out + 0.20 cache read + 8 (2x input) 1h write
  assert.ok(Math.abs((m1.cost ?? 0) - 32.2) < 1e-9);
  const m3 = res.records.find((r) => r.key === "m3:r3");
  assert.ok(m3);
  assert.equal(m3.cost, undefined, "unknown model is unpriced");
  assert.equal(m3.cacheWrite5m, 50, "legacy aggregate cache_creation is treated as 5m");
});

test("pricing prefers the most specific prefix", () => {
  const u = { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };
  assert.equal(costOf("claude-opus-5-5", u), 4);
  assert.equal(costOf("claude-opus-5", u), 5);
  assert.equal(costOf("claude-sonnet-4-6", u), 3);
});
