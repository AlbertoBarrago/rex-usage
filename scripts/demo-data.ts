/**
 * Generates a synthetic `~/.claude/projects`-shaped tree for demos and screenshots,
 * so no real project names or usage ever leak into public material.
 *
 * Output is deterministic for a given day (seeded PRNG); timestamps are relative
 * to "now" so the dashboard always looks alive. A few files get a fresh mtime to
 * show up as live sessions.
 *
 * Usage: tsx scripts/demo-data.ts [outDir]   (prints the output dir)
 */
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = process.argv[2] ?? join(tmpdir(), "rex-usage-demo", "projects");
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
  /** Relative activity level, scales messages per day. */
  weight: number;
  models: Array<[model: string, share: number]>;
  live: boolean;
}

const PROJECTS: Project[] = [
  { name: "orbital-api", weight: 1, models: [["claude-opus-5-5", 0.85], ["claude-haiku-5-5", 0.15]], live: true },
  { name: "pixel-forge", weight: 0.7, models: [["claude-opus-5-5", 0.6], ["claude-sonnet-5-5", 0.4]], live: true },
  { name: "nebula-docs", weight: 0.45, models: [["claude-sonnet-5-5", 1]], live: false },
  { name: "quasar-mobile", weight: 0.4, models: [["claude-opus-5-5", 0.7], ["claude-sonnet-5-5", 0.3]], live: false },
  { name: "lumen-infra", weight: 0.3, models: [["claude-fable-5-1", 0.3], ["claude-opus-5-5", 0.7]], live: true },
  { name: "comet-cli", weight: 0.22, models: [["claude-sonnet-5-5", 0.8], ["claude-haiku-5-5", 0.2]], live: false },
  { name: "aurora-ui", weight: 0.15, models: [["claude-opus-5-5", 1]], live: false },
  { name: "zenith-ml", weight: 0.1, models: [["claude-opus-5-5", 0.5], ["claude-haiku-5-5", 0.5]], live: false },
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

for (const p of PROJECTS) {
  const slug = `-Users-demo-Projects-${p.name}`;
  const dir = join(OUT, slug);
  mkdirSync(dir, { recursive: true });

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

    const sessionId = `demo-${p.name}-${d}`;
    const lines: string[] = [];
    for (let i = 0; i < messages; i++) {
      // Working hours 9-19, skewed to late morning and afternoon.
      const hour = 9 + Math.floor(Math.pow(rand(), 0.9) * span);
      const ts = Math.min(now - 1_000, dayStart + hour * 3_600_000 + Math.floor(rand() * 3_600_000));
      const ctx = 20_000 + Math.floor(rand() * 140_000);
      const usage = {
        input_tokens: 1 + Math.floor(rand() * 8),
        output_tokens: 150 + Math.floor(Math.pow(rand(), 2) * 4_000),
        cache_read_input_tokens: ctx,
        cache_creation_input_tokens: 0,
        cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: Math.floor(rand() * 6_000) },
      };
      lines.push(
        JSON.stringify({
          type: "assistant",
          timestamp: new Date(ts).toISOString(),
          sessionId,
          cwd: `/Users/demo/Projects/${p.name}`,
          requestId: `req_${sessionId}_${i}`,
          message: { id: `msg_${sessionId}_${i}`, model: pick(p.models, rand()), usage },
        }),
      );
    }
    const file = join(dir, `${sessionId}.jsonl`);
    writeFileSync(file, `${lines.join("\n")}\n`);
    // Only today's file of "live" projects counts as an active session.
    // Never in the future: a future mtime would also count as live.
    const mtime = d === 0 && p.live ? new Date(now) : new Date(Math.min(dayStart + 20 * 3_600_000, now - 3_600_000));
    utimesSync(file, mtime, mtime);
  }
}

console.log(OUT);
