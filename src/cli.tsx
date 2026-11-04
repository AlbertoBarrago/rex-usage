#!/usr/bin/env node
import { render } from "ink";
import { parseArgs } from "node:util";
import { codexSources, DEFAULT_CODEX_HOME } from "./codex.js";
import { claudeSource, DEFAULT_ROOT, Scanner } from "./scan.js";
import { App, SOURCE_FILTERS, type SourceFilter } from "./ui/App.js";

const HELP = `rex-usage: nerdy TUI for Claude Code and Codex token and cost usage

Usage: rex-usage [options]

Options:
  -d, --days <n|all>     initial range: 1, 7, 30 or all (default 7)
  -s, --source <name>    initial source: all, claude or codex (default all)
  -p, --project <text>   only projects whose name contains <text>
      --root <dir>       Claude transcripts root (env REX_USAGE_ROOT, default ${DEFAULT_ROOT})
      --codex-home <dir> Codex home (env REX_USAGE_CODEX_HOME, then CODEX_HOME, default ${DEFAULT_CODEX_HOME})
  -h, --help             show this help

Keys: j/k move · enter open · esc back · tab view · d range · s source · r refresh · q quit`;

function parseDays(v: string): number | null {
  if (v === "all") return null;
  const n = Number(v);
  if (![1, 7, 30].includes(n)) throw new Error(`--days must be 1, 7, 30 or all (got "${v}")`);
  return n;
}

function parseSource(v: string): SourceFilter {
  if (!(SOURCE_FILTERS as readonly string[]).includes(v)) {
    throw new Error(`--source must be ${SOURCE_FILTERS.join(", ")} (got "${v}")`);
  }
  return v as SourceFilter;
}

try {
  const { values } = parseArgs({
    options: {
      days: { type: "string", short: "d", default: "7" },
      source: { type: "string", short: "s", default: "all" },
      project: { type: "string", short: "p" },
      root: { type: "string" },
      "codex-home": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }
  const codexHome =
    values["codex-home"] ?? process.env.REX_USAGE_CODEX_HOME ?? process.env.CODEX_HOME ?? DEFAULT_CODEX_HOME;
  const scanner = new Scanner([
    claudeSource(values.root ?? process.env.REX_USAGE_ROOT ?? DEFAULT_ROOT),
    ...codexSources(codexHome),
  ]);
  render(
    <App
      scanner={scanner}
      initialDays={parseDays(values.days)}
      initialSource={parseSource(values.source)}
      projectFilter={values.project}
    />,
    { alternateScreen: true },
  );
} catch (e) {
  console.error(`rex-usage: ${(e as Error).message}\n\n${HELP}`);
  process.exit(2);
}
