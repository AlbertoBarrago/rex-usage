#!/usr/bin/env node
import { render } from "ink";
import { parseArgs } from "node:util";
import { DEFAULT_ROOT, Scanner } from "./scan.js";
import { App } from "./ui/App.js";

const HELP = `rex-usage: nerdy TUI for Claude Code token and cost usage

Usage: rex-usage [options]

Options:
  -d, --days <n|all>     initial range: 1, 7, 30 or all (default 7)
  -p, --project <text>   only projects whose name contains <text>
      --root <dir>       transcripts root (default ${DEFAULT_ROOT})
  -h, --help             show this help

Keys: tab view · d range · r refresh · q quit`;

function parseDays(v: string): number | null {
  if (v === "all") return null;
  const n = Number(v);
  if (![1, 7, 30].includes(n)) throw new Error(`--days must be 1, 7, 30 or all (got "${v}")`);
  return n;
}

try {
  const { values } = parseArgs({
    options: {
      days: { type: "string", short: "d", default: "7" },
      project: { type: "string", short: "p" },
      root: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }
  const scanner = new Scanner(values.root ?? DEFAULT_ROOT);
  render(<App scanner={scanner} initialDays={parseDays(values.days)} projectFilter={values.project} />, {
    alternateScreen: true,
  });
} catch (e) {
  console.error(`rex-usage: ${(e as Error).message}\n\n${HELP}`);
  process.exit(2);
}
