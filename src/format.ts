const SPARK = "▁▂▃▄▅▆▇█";

export function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

export function fmtUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

export function fmtPct(r: number): string {
  return `${(r * 100).toFixed(1)}%`;
}

/**
 * Multi-row sparkline, top row first. Each column is filled bottom-up with
 * eighth-block precision across `height` rows; nonzero values always show at
 * least one eighth so activity never disappears.
 */
export function sparkRows(values: number[], height: number): string[] {
  const max = Math.max(...values, 0);
  const total = height * 8;
  const levels = values.map((v) => (max === 0 || v <= 0 ? 0 : Math.max(1, Math.round((v / max) * total))));
  const rows: string[] = [];
  for (let r = height - 1; r >= 0; r--) {
    rows.push(
      levels
        .map((l) => {
          const fill = Math.min(8, Math.max(0, l - r * 8));
          // Bottom row keeps a faint baseline for empty columns.
          if (fill === 0) return r === 0 ? "▁" : " ";
          return SPARK[fill - 1]!;
        })
        .join(""),
    );
  }
  return rows;
}

/** Horizontal bar with eighth-block resolution so small differences stay visible. */
export function bar(ratio: number, width: number): string {
  const r = Math.max(0, Math.min(1, ratio));
  const eighths = Math.round(r * width * 8);
  const full = Math.floor(eighths / 8);
  const part = eighths % 8;
  const partial = part ? " ▏▎▍▌▋▊▉"[part]! : "";
  return ("█".repeat(full) + partial).padEnd(width, "·");
}

export function shortModel(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s.padEnd(n) : `${s.slice(0, n - 1)}…`;
}

/** Compact duration: `42s`, `17m`, `1h12m`, `3d4h`. */
export function fmtDuration(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return `${Math.max(0, Math.round(ms / 1000))}s`;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d${h % 24}h`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local `MM-DD HH:MM`. */
export function fmtStamp(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Local `HH:MM`. */
export function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** First 8 chars of a session id (UUIDs are unique enough there); empty ids show as `unknown`. */
export function shortId(id: string): string {
  return id ? id.slice(0, 8) : "unknown";
}
