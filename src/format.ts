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

/** One Unicode block per value, scaled to the max. Zero stays a flat baseline. */
export function sparkline(values: number[]): string {
  const max = Math.max(...values, 0);
  if (max === 0) return SPARK[0]!.repeat(values.length);
  return values
    .map((v) => SPARK[Math.min(SPARK.length - 1, Math.round((v / max) * (SPARK.length - 1)))]!)
    .join("");
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
