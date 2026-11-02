import { homedir } from "node:os";
import { basename, join } from "node:path";
import { costOf, type TokenUsage } from "./pricing.js";
import { lines, type FileResult, type SourceSpec, type UsageRecord } from "./scan.js";

/**
 * Codex CLI rollouts: `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`, moved
 * to `archived_sessions/` when archived. Each line is `{timestamp, type, payload}`.
 */
export const DEFAULT_CODEX_HOME = join(homedir(), ".codex");

/** Project name used when a rollout carries no working directory. */
const UNKNOWN_PROJECT = "(codex)";

interface RawUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

interface RawLine {
  timestamp?: string;
  type?: string;
  payload?: {
    type?: string;
    id?: string;
    cwd?: string;
    model?: string;
    info?: { total_token_usage?: RawUsage; last_token_usage?: RawUsage } | null;
  };
}

/**
 * Stateful line parser for one rollout file. Usage events (`token_count`) do
 * not name the model or project: those come from the preceding `session_meta`
 * and `turn_context` lines, so lines must be fed in file order.
 */
export class CodexParser {
  private sessionId = "";
  private cwd: string | undefined;
  private model: string | undefined;
  /** Cumulative total of the previous usage event, to drop repeated events. */
  private lastTotal: string | undefined;

  /** Returns `null` for lines without new usage; throws on malformed JSON. */
  push(line: string): UsageRecord | null {
    const d = JSON.parse(line) as RawLine;
    const p = d.payload;
    if (!p) return null;
    if (d.type === "session_meta") {
      this.sessionId = p.id ?? this.sessionId;
      this.cwd = p.cwd ?? this.cwd;
      return null;
    }
    if (d.type === "turn_context") {
      this.model = p.model ?? this.model;
      this.cwd = p.cwd ?? this.cwd;
      return null;
    }
    if (d.type !== "event_msg" || p.type !== "token_count") return null;

    const last = p.info?.last_token_usage;
    const total = p.info?.total_token_usage;
    if (!last || !total || !d.timestamp || !this.model) return null;
    // Codex re-emits token_count (e.g. on rate-limit updates) with unchanged totals: not a new request.
    const totalKey = JSON.stringify(total);
    if (totalKey === this.lastTotal) return null;
    this.lastTotal = totalKey;

    const cached = last.cached_input_tokens ?? 0;
    const tokens: TokenUsage = {
      // OpenAI reports cached tokens as a subset of input; reasoning is already inside output.
      input: Math.max(0, (last.input_tokens ?? 0) - cached),
      output: last.output_tokens ?? 0,
      cacheRead: cached,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
    };
    return {
      ...tokens,
      // Forked sessions copy history lines verbatim: timestamp + running total identifies the event across files.
      key: `codex:${d.timestamp}:${total.total_tokens ?? totalKey}`,
      source: "codex",
      ts: Date.parse(d.timestamp),
      model: this.model,
      project: this.cwd ? basename(this.cwd) : UNKNOWN_PROJECT,
      sessionId: this.sessionId,
      cost: costOf(this.model, tokens),
    };
  }
}

export async function readCodexFile(path: string): Promise<FileResult> {
  const parser = new CodexParser();
  const records: UsageRecord[] = [];
  let skipped = 0;
  for await (const line of lines(path)) {
    try {
      const rec = parser.push(line);
      if (rec) records.push(rec);
    } catch {
      skipped++;
    }
  }
  return { records, skipped };
}

/** Live and archived rollouts under a Codex home; both optional so a missing Codex install is silent. */
export function codexSources(home: string = DEFAULT_CODEX_HOME): SourceSpec[] {
  return ["sessions", "archived_sessions"].map((dir) => ({
    source: "codex",
    root: join(home, dir),
    optional: true,
    readFile: (path) => readCodexFile(path),
  }));
}
