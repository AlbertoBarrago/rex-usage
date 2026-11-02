import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { CodexParser, codexSources } from "../src/codex.js";
import { costOf } from "../src/pricing.js";
import { claudeSource, Scanner } from "../src/scan.js";

const FIXTURES = join(import.meta.dirname, "fixtures");
const NOW = Date.parse("2030-01-01");

test("codex scanner maps usage, drops repeats and forked copies, counts malformed lines", async () => {
  const res = await new Scanner(codexSources(join(FIXTURES, "codex"))).scan(NOW);
  assert.equal(res.skipped, 1);
  assert.deepEqual(res.errors, []);
  assert.equal(res.records.length, 2, "repeated token_count and the forked copy are deduped");

  const big = res.records.find((r) => r.model === "gpt-6.1-sol");
  assert.ok(big);
  assert.equal(big.source, "codex");
  assert.equal(big.project, "alpha");
  assert.equal(big.input, 600_000, "cached tokens are subtracted from input");
  assert.equal(big.cacheRead, 400_000);
  assert.equal(big.output, 100_000, "reasoning is already part of output");
  // Prompt is 1M tokens (> 272K): long-context rates 4 in, 0.20 cached, 15 out.
  assert.ok(Math.abs((big.cost ?? 0) - (0.6 * 4 + 0.4 * 0.2 + 0.1 * 15)) < 1e-9);

  const reserve = res.records.find((r) => r.model === "gpt-reserve");
  assert.ok(reserve);
  assert.equal(reserve.cost, undefined, "unknown model is unpriced");
});

test("codex parser ignores usage before the first turn_context", () => {
  const p = new CodexParser();
  const line = JSON.stringify({
    timestamp: "2030-01-01T00:00:00Z",
    type: "event_msg",
    payload: { type: "token_count", info: { total_token_usage: { total_tokens: 1 }, last_token_usage: { input_tokens: 1 } } },
  });
  assert.equal(p.push(line), null);
});

test("missing codex home is silent, missing claude root is an error", async () => {
  const res = await new Scanner([claudeSource("/nonexistent/claude"), ...codexSources("/nonexistent/codex")]).scan(NOW);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0] ?? "", /nonexistent\/claude/);
});

test("openai long-context pricing switches above 272K prompt tokens", () => {
  const short = { input: 272_000, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };
  assert.ok(Math.abs((costOf("gpt-6.1-sol", short) ?? 0) - 0.544) < 1e-9);
  assert.ok(Math.abs((costOf("gpt-6.1-sol", { ...short, input: 272_001 }) ?? 0) - 1.088004) < 1e-9);
});
