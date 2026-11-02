# rex-usage

Nerdy terminal dashboard for Claude Code token and cost usage, made to live in a Rex pane.

```
 █▀█ █▀▀ ▀▄▀ ╱╱ █ █ █▀ ▄▀█ █▀▀ █▀▀                            ● 4 live sessions
 █▀▄ ██▄ █ █ ╱╱ █▄█ ▄█ █▀█ █▄█ ██▄                  claude code token telemetry

 ╭────────────────────────────────────────────────────────────────────────────╮
 │ today   7 days  all time  out tokens  cache read  cache hit  msgs          │
 │ $80.77  $386    $1.49k    13.0M       4.30B       98.7%      16.4k         │
 ╰────────────────────────────────────────────────────────────────────────────╯

 cost / day · last 30d · peak $113    out tokens / hour · today · peak 247.8k
 ▁▄▄▆▇█▄▇▆▂▃▁▂▁▁▅▁▇▂▃▁▄▅▃▃▃▄▅▇▆       ▁▁▁▁▁▁▁▁▂▅▂▄█▅▅▄▁▁▁▁▁▁▁▁
```

It reads the transcripts Claude Code writes to `~/.claude/projects/**/*.jsonl` (subagents included), deduplicates streamed messages, and shows:

- cost today, last 7 days and for the selected range
- output tokens, cache reads, cache hit ratio, message count
- live sessions (transcripts written in the last 5 minutes)
- cost per day sparkline and output tokens per hour for today
- top projects or models, with token breakdown and a share bar

Data refreshes every 5 seconds; only changed files are re-read.

> Costs are **estimates** at Anthropic API list prices (`src/pricing.ts`). A Claude subscription is not billed per token, so read them as "what this would cost on the API". Models without a known price show a `?` next to their cost.

## Install

Requires Node 22+.

```sh
npm install
npm run build
ln -s "$PWD/dist/cli.js" ~/.local/bin/rex-usage   # or: npm link
```

## Usage

```sh
rex-usage                 # last 7 days
rex-usage -d all          # range: 1, 7, 30 or all
rex-usage -p markasso     # only projects whose name contains "markasso"
rex-usage --root <dir>    # read transcripts from another directory
```

| Key   | Action                      |
| ----- | --------------------------- |
| `tab` | toggle projects / models    |
| `d`   | cycle range 1 / 7 / 30 / all |
| `r`   | refresh now                 |
| `q`   | quit                        |

### In Rex

Open it in a new tab of the current session:

```sh
rex window new -s "$REX_SESSION" Usage -- rex-usage
```

Or as a side panel next to your current pane:

```sh
rex split -s "$REX_SESSION" -b "$REX_BLOCK" --split=right --ratio 40 --label Usage -- rex-usage
```

Below 110 columns the models column is hidden to keep rows on one line.

## Development

```sh
npm run dev         # run from source with tsx
npm run typecheck
npm test            # node:test via tsx, fixtures in test/fixtures
```

Layout: `src/scan.ts` (transcript reader, dedup, incremental cache), `src/pricing.ts`, `src/aggregate.ts` (pure aggregations), `src/format.ts` (numbers, sparklines, bars), `src/ui/*` (Ink components).
