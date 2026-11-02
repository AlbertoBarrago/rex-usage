import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, sep } from "node:path";
import { createInterface } from "node:readline";
import { costOf, type TokenUsage } from "./pricing.js";

/** Which coding agent produced a record. */
export type Source = "claude" | "codex";

export interface UsageRecord extends TokenUsage {
  /** Dedup key, unique across files and sources. */
  key: string;
  source: Source;
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

/**
 * One transcript tree to scan. Every `*.jsonl` under `root` (recursively) is
 * handed to `readFile`, which owns the format.
 */
export interface SourceSpec {
  source: Source;
  root: string;
  /** A missing root is not an error: the tool may simply not be installed. */
  optional?: boolean;
  /** `rel` is the file path relative to `root`. */
  readFile(path: string, rel: string): Promise<FileResult>;
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
    source: "claude",
    ts: Date.parse(d.timestamp),
    model: d.message.model,
    project: d.cwd ? basename(d.cwd) : fallbackProject,
    sessionId: d.sessionId ?? "",
    cost: costOf(d.message.model, tokens),
  };
}

/** Streams the non-empty lines of a file. */
export async function* lines(path: string): AsyncGenerator<string> {
  const rl = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield line;
}

export async function readFile(path: string, fallbackProject: string): Promise<FileResult> {
  const byKey = new Map<string, UsageRecord>();
  let skipped = 0;
  for await (const line of lines(path)) {
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

/** Claude Code transcripts: every `.jsonl` under `<root>/<project-slug>/`, at any depth. */
export function claudeSource(root: string = DEFAULT_ROOT): SourceSpec {
  return {
    source: "claude",
    root,
    // Subagent transcripts live in `<slug>/<session>/subagents/*.jsonl`: the slug is always the first segment.
    readFile: (path, rel) => readFile(path, projectFromSlug(rel.split(sep)[0] ?? rel)),
  };
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  result: FileResult;
}

function isMissing(e: unknown): boolean {
  return (e as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Incremental scanner over one or more sources: keeps parsed results per file
 * and re-reads only files whose mtime or size changed since the previous scan.
 */
export class Scanner {
  private cache = new Map<string, CacheEntry>();

  constructor(private readonly sources: readonly SourceSpec[]) {}

  async scan(now = Date.now()): Promise<ScanResult> {
    const errors: string[] = [];
    let skipped = 0;
    let activeSessions = 0;
    const seen = new Set<string>();

    for (const src of this.sources) {
      let files: string[];
      try {
        files = (await readdir(src.root, { recursive: true })).filter((f) => f.endsWith(".jsonl"));
      } catch (e) {
        if (!(src.optional && isMissing(e))) errors.push(`cannot read ${src.root}: ${(e as Error).message}`);
        continue;
      }
      for (const rel of files) {
        const path = join(src.root, rel);
        seen.add(path);
        try {
          const st = await stat(path);
          if (now - st.mtimeMs < ACTIVE_WINDOW_MS) activeSessions++;
          const hit = this.cache.get(path);
          if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) continue;
          const result = await src.readFile(path, rel);
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
