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
