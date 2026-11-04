/**
 * Generates synthetic Claude Code (`<out>/projects`) and Codex (`<out>/codex/sessions`)
 * trees for demos and screenshots, so no real project names or usage ever leak
 * into public material.
 *
 * Output is deterministic for a given day (seeded PRNG); timestamps are relative
 * to "now" so the dashboard always looks alive. A few files get a fresh mtime to
 * show up as live sessions.
 *
 * Usage: tsx scripts/demo-data.ts [outDir]   (prints the output dir; pass
 * `<out>/projects` as --root and `<out>/codex` as --codex-home)
 */
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = process.argv[2] ?? join(tmpdir(), "rex-usage-demo");
const CLAUDE_OUT = join(OUT, "projects");
const CODEX_OUT = join(OUT, "codex", "sessions");
const DAYS = 30;
const DAY_MS = 86_400_000;

/** Mulberry32: tiny deterministic PRNG. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Project {
  name: string;
  source: "claude" | "codex";
  /** Relative activity level, scales messages per day. */
  weight: number;
  models: Array<[model: string, share: number]>;
  live: boolean;
}

const PROJECTS: Project[] = [
  { name: "orbital-api", source: "claude", weight: 1, models: [["claude-opus-5-5", 0.85], ["claude-haiku-5-5", 0.15]], live: true },
  { name: "pixel-forge", source: "claude", weight: 0.7, models: [["claude-opus-5-5", 0.6], ["claude-sonnet-5-5", 0.4]], live: true },
  { name: "nebula-docs", source: "claude", weight: 0.45, models: [["claude-sonnet-5-5", 1]], live: false },
  { name: "quasar-mobile", source: "claude", weight: 0.4, models: [["claude-opus-5-5", 0.7], ["claude-sonnet-5-5", 0.3]], live: false },
  { name: "lumen-infra", source: "claude", weight: 0.3, models: [["claude-fable-5-1", 0.3], ["claude-opus-5-5", 0.7]], live: true },
  { name: "comet-cli", source: "claude", weight: 0.22, models: [["claude-sonnet-5-5", 0.8], ["claude-haiku-5-5", 0.2]], live: false },
  { name: "aurora-ui", source: "claude", weight: 0.15, models: [["claude-opus-5-5", 1]], live: false },
  { name: "zenith-ml", source: "claude", weight: 0.1, models: [["claude-opus-5-5", 0.5], ["claude-haiku-5-5", 0.5]], live: false },
  // Codex, sharing some projects with Claude so the merged view sums them.
  { name: "orbital-api", source: "codex", weight: 0.5, models: [["gpt-6.1-sol", 0.8], ["gpt-6-luna", 0.2]], live: true },
  { name: "photon-sdk", source: "codex", weight: 0.35, models: [["gpt-6.1-sol", 0.6], ["gpt-5.6-sol", 0.4]], live: false },
  { name: "nebula-docs", source: "codex", weight: 0.15, models: [["gpt-6-astra", 1]], live: false },
];

function pick(models: Project["models"], r: number): string {
  let acc = 0;
  for (const [m, share] of models) {
    acc += share;
    if (r <= acc) return m;
  }
  return models[0]![0];
}

const now = Date.now();
const today = new Date(now);
today.setHours(0, 0, 0, 0);
const rand = prng(today.getTime() / DAY_MS);

rmSync(OUT, { recursive: true, force: true });

/** Deterministic UUID-shaped session id, so short ids look like real ones. */
function uuid(): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
}

/** One Claude Code transcript line. */
function claudeLine(ts: number, sessionId: string, cwd: string, i: number, model: string, ctx: number): string[] {
  const usage = {
    input_tokens: 1 + Math.floor(rand() * 8),
    output_tokens: 150 + Math.floor(Math.pow(rand(), 2) * 4_000),
    cache_read_input_tokens: ctx,
    cache_creation_input_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: Math.floor(rand() * 6_000) },
  };
  return [
    JSON.stringify({
      type: "assistant",
      timestamp: new Date(ts).toISOString(),
      sessionId,
      cwd,
      requestId: `req_${sessionId}_${i}`,
      message: { id: `msg_${sessionId}_${i}`, model, usage },
    }),
  ];
}

/** Running per-session total, since Codex token_count events carry a cumulative counter. */
const codexTotals = new Map<string, number>();

/** One Codex request: a turn_context (model) plus its token_count event. */
function codexLines(ts: number, sessionId: string, cwd: string, _i: number, model: string, ctx: number): string[] {
  const iso = new Date(ts).toISOString();
  const cached = Math.floor(ctx * (0.7 + rand() * 0.25));
  const last = {
    input_tokens: ctx,
    cached_input_tokens: cached,
    output_tokens: 100 + Math.floor(Math.pow(rand(), 2) * 3_000),
    reasoning_output_tokens: Math.floor(rand() * 800),
    total_tokens: 0,
  };
  last.total_tokens = last.input_tokens + last.output_tokens;
  const total = (codexTotals.get(sessionId) ?? 0) + last.total_tokens;
  codexTotals.set(sessionId, total);
  return [
    JSON.stringify({ timestamp: iso, type: "turn_context", payload: { model, cwd } }),
    JSON.stringify({
      timestamp: iso,
      type: "event_msg",
      payload: { type: "token_count", info: { total_token_usage: { ...last, total_tokens: total }, last_token_usage: last } },
    }),
  ];
}

for (const p of PROJECTS) {
  const codex = p.source === "codex";
  const dir = codex ? CODEX_OUT : join(CLAUDE_OUT, `-Users-demo-Projects-${p.name}`);
  mkdirSync(dir, { recursive: true });
  const cwd = `/Users/demo/Projects/${p.name}`;

  for (let d = DAYS - 1; d >= 0; d--) {
    const dayStart = today.getTime() - d * DAY_MS;
    const weekday = new Date(dayStart).getDay();
    // Quieter weekends plus a slow upward trend, so the sparkline has shape.
    const dayFactor = (weekday === 0 || weekday === 6 ? 0.25 : 1) * (0.5 + (DAYS - d) / DAYS) * (0.6 + rand() * 0.8);
    // Today only runs up to the current hour, so scale volume by the elapsed workday.
    const nowHour = new Date(now).getHours();
    const span = d === 0 ? Math.max(1, Math.min(10, nowHour - 9 + 1)) : 10;
    const messages = Math.round(70 * p.weight * dayFactor * (span / 10));
    if (messages === 0) continue;

    // Split the workday into 1-3 back-to-back sessions so drill-down has something to show.
    const sessions = messages > 20 ? 1 + Math.floor(rand() * 3) : 1;
    for (let k = 0; k < sessions; k++) {
      const sessionId = uuid();
      const live = d === 0 && p.live && k === sessions - 1;
      const count = Math.round(messages / sessions);
      const from = 9 + (k * span) / sessions;
      const width = span / sessions;
      const lines: string[] = codex
        ? [JSON.stringify({ timestamp: new Date(dayStart).toISOString(), type: "session_meta", payload: { id: sessionId, cwd } })]
        : [];
      for (let i = 0; i < count; i++) {
        // Working hours 9-19, skewed to late morning and afternoon.
        const hour = from + Math.pow(rand(), 0.9) * width;
        // A live session's last message lands just now, so the table shows its live dot.
        const ts = live && i === count - 1 ? now - 30_000 : Math.min(now - 1_000, dayStart + Math.floor(hour * 3_600_000));
        const ctx = 20_000 + Math.floor(rand() * 140_000);
        lines.push(...(codex ? codexLines : claudeLine)(ts, sessionId, cwd, i, pick(p.models, rand()), ctx));
      }
      const file = join(dir, codex ? `rollout-${sessionId}.jsonl` : `${sessionId}.jsonl`);
      writeFileSync(file, `${lines.join("\n")}\n`);
      // Only the last of today's files of "live" projects counts as an active session.
      // Never in the future: a future mtime would also count as live.
      const mtime = live ? new Date(now) : new Date(Math.min(dayStart + 20 * 3_600_000, now - 3_600_000));
      utimesSync(file, mtime, mtime);
    }
  }
}

console.log(OUT);
