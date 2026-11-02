import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { costOf, type TokenUsage } from "./pricing.js";

export interface UsageRecord extends TokenUsage {
  /** Dedup key: message id + request id. */
  key: string;
  ts: number;
  model: string;
  project: string;
  sessionId: string;
  /** `undefined` when the model has no known price. */
  cost: number | undefined;
}

export interface FileResult {
  records: UsageRecord[];
  skipped: number;
}

export interface ScanResult {
  records: UsageRecord[];
  /** Malformed lines plus unreadable files. */
  skipped: number;
  /** Session files modified within the active window. */
  activeSessions: number;
  errors: string[];
}

export const DEFAULT_ROOT = join(homedir(), ".claude", "projects");
const ACTIVE_WINDOW_MS = 5 * 60_000;

interface RawLine {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  requestId?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_creation?: {
        ephemeral_5m_input_tokens?: number;
        ephemeral_1h_input_tokens?: number;
      };
    };
  };
}

/** Turns a Claude Code project slug (`-Users-me-Projects-foo`) into a short fallback name. */
function projectFromSlug(slug: string): string {
  const parts = slug.split("-").filter(Boolean);
  return parts.at(-1) ?? slug;
}

/**
 * Parses one transcript line. Returns `null` for lines that are valid JSON but
 * carry no usage (user turns, summaries), and throws on malformed JSON so the
 * caller can count it.
 */
export function parseLine(line: string, fallbackProject: string): UsageRecord | null {
  const d = JSON.parse(line) as RawLine;
  const u = d.message?.usage;
  if (d.type !== "assistant" || !u || !d.message?.model || !d.timestamp) return null;
  // Synthetic messages (e.g. API errors rendered locally) have no real usage.
  if (d.message.model === "<synthetic>") return null;

  const cc = u.cache_creation;
  // Older transcripts only report the aggregate cache_creation_input_tokens: treat it as 5m writes.
  const w5 = cc ? (cc.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0);
  const w1 = cc ? (cc.ephemeral_1h_input_tokens ?? 0) : 0;
  const tokens: TokenUsage = {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite5m: w5,
    cacheWrite1h: w1,
  };
  return {
    ...tokens,
    key: `${d.message.id ?? ""}:${d.requestId ?? ""}`,
    ts: Date.parse(d.timestamp),
    model: d.message.model,
    project: d.cwd ? basename(d.cwd) : fallbackProject,
    sessionId: d.sessionId ?? "",
    cost: costOf(d.message.model, tokens),
  };
}

export async function readFile(path: string, fallbackProject: string): Promise<FileResult> {
  const byKey = new Map<string, UsageRecord>();
  let skipped = 0;
  const rl = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const rec = parseLine(line, fallbackProject);
      // Streaming writes the same message several times: the last write has the final usage.
      if (rec) byKey.set(rec.key, rec);
    } catch {
      skipped++;
    }
  }
  return { records: [...byKey.values()], skipped };
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  result: FileResult;
}

/**
 * Incremental scanner: keeps parsed results per file and re-reads only files
 * whose mtime or size changed since the previous scan.
 */
export class Scanner {
  private cache = new Map<string, CacheEntry>();

  constructor(private readonly root: string = DEFAULT_ROOT) {}

  async scan(now = Date.now()): Promise<ScanResult> {
    const errors: string[] = [];
    let skipped = 0;
    let activeSessions = 0;
    const seen = new Set<string>();

    let slugs: string[];
    try {
      slugs = await readdir(this.root);
    } catch (e) {
      return { records: [], skipped: 0, activeSessions: 0, errors: [`cannot read ${this.root}: ${(e as Error).message}`] };
    }

    for (const slug of slugs) {
      const dir = join(this.root, slug);
      let files: string[];
      try {
        // Recursive: subagent transcripts live in `<session>/subagents/*.jsonl`.
        files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue; // not a directory
      }
      for (const f of files) {
        const path = join(dir, f);
        seen.add(path);
        try {
          const st = await stat(path);
          if (now - st.mtimeMs < ACTIVE_WINDOW_MS) activeSessions++;
          const hit = this.cache.get(path);
          if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) continue;
          const result = await readFile(path, projectFromSlug(slug));
          this.cache.set(path, { mtimeMs: st.mtimeMs, size: st.size, result });
        } catch (e) {
          skipped++;
          errors.push(`${path}: ${(e as Error).message}`);
        }
      }
    }

    for (const path of this.cache.keys()) if (!seen.has(path)) this.cache.delete(path);

    // Subagent turns can be mirrored across files: dedup globally too.
    const all = new Map<string, UsageRecord>();
    for (const { result } of this.cache.values()) {
      skipped += result.skipped;
      for (const r of result.records) all.set(r.key, r);
    }
    return { records: [...all.values()], skipped, activeSessions, errors };
  }
}
