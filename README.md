<div align="center">

# rex-usage

**A terminal dashboard for Claude Code token usage and cost, built to live in a Rex pane.**

[![License: MIT](https://img.shields.io/badge/license-MIT-ff5fd7.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/rex-usage.svg?color=ffaf5f)](https://www.npmjs.com/package/rex-usage)
![Node](https://img.shields.io/badge/node-%3E%3D22-8787ff.svg)
![Built with Ink](https://img.shields.io/badge/built%20with-Ink-5fd7ff.svg)

<img src="demo/rex-usage.gif" alt="rex-usage demo: dashboard with cost KPIs, daily and hourly charts, and a per-project table" width="900">

</div>

---

If you run several Claude Code agents at once, it is hard to tell which project burns the most tokens, how much of your context comes from cache, or what a busy day would cost on the API. `rex-usage` reads the transcripts Claude Code already writes to disk and turns them into a live dashboard. It needs no setup, has no network access, and adds no telemetry.

## Features

- **Cost at a glance.** Today, last 7 days, and any range (1, 7, 30 days or all time), estimated at Anthropic API list prices.
- **Token breakdown.** Input, output, cache reads and cache writes (5 minute and 1 hour TTL), plus your cache hit ratio.
- **Trends.** A 30-day cost chart and a per-hour output chart for today, colored by intensity.
- **Per project or per model.** Ranked tables with the models used and a share bar. Press `tab` to switch.
- **Live sessions.** A pulsing indicator counts transcripts written in the last 5 minutes, so you can see how many agents are working right now.
- **Subagents included.** Usage from subagent transcripts (`<session>/subagents/*.jsonl`) is counted too.
- **Fits any pane.** Columns adapt to the width, and in short panes the header collapses to one line and the charts shrink.
- **Rex integration.** A Lua action opens the dashboard beside the focused pane with one key.

## Install

Requires **Node.js 22+**.

```sh
npm install -g rex-usage
```

Or from a clone:

```sh
git clone https://github.com/AlbertoBarrago/rex-usage.git
cd rex-usage
npm install          # also builds dist/ through the prepare script
npm link             # or: ln -s "$PWD/dist/cli.js" ~/.local/bin/rex-usage
```

Want to look around before pointing it at your own data? `npm run demo` starts it on a synthetic dataset.

## Usage

```sh
rex-usage                 # last 7 days
rex-usage -d 30           # initial range: 1, 7, 30 or all
rex-usage -p api          # only projects whose name contains "api"
rex-usage --root <dir>    # read transcripts from another directory (env: REX_USAGE_ROOT)
```

| Key   | Action                          |
| ----- | ------------------------------- |
| `tab` | switch between projects and models |
| `d`   | cycle range: 1 / 7 / 30 / all days |
| `r`   | refresh now                     |
| `q`   | quit                            |

The dashboard refreshes every 5 seconds and runs in the terminal's alternate screen, so quitting gives you your scrollback back untouched.

## Rex integration

### Plugin: one key to open the dashboard

[`rex/rex-usage.lua`](rex/rex-usage.lua) defines a `rex_usage` action ("Open Usage Dashboard") that opens the dashboard in a split to the right of the focused pane.

```sh
mkdir -p ~/.config/rex
cp "$(npm root -g)/rex-usage/rex/rex-usage.lua" ~/.config/rex/   # or rex/rex-usage.lua from a clone
echo 'require("rex-usage")' >> ~/.config/rex/init.lua
rex config check && rex config reload
```

Then use any of these:

- press <kbd>ctrl</kbd>+<kbd>b</kbd> <kbd>u</kbd> (change the `rex.bind` line at the bottom of the file to pick another key)
- run `rex do rex_usage`
- pick **Open Usage Dashboard** in the command palette

Rex starts commands through a non-interactive login shell, which does not read `~/.zshrc` or `~/.bashrc`. The plugin adds the usual user bin folders (`~/.local/bin`, `~/.npm-global/bin`, Homebrew) to `PATH` for you. If Rex still can't find the binary, set `REX_USAGE_BIN` at the top of the file to an absolute path.

### From the CLI

```sh
# new tab in the current session
rex window new -s "$REX_SESSION" Usage -- rex-usage

# side panel next to your pane
rex split -s "$REX_SESSION" -b "$REX_BLOCK" --split=right --ratio 40 --label Usage -- rex-usage
```

## How it works

Claude Code stores every conversation as JSON Lines under `~/.claude/projects/<project>/`. Each assistant turn carries the model id and a `usage` object.

1. **Scan.** All `*.jsonl` files are read recursively, subagent transcripts included.
2. **Deduplicate.** Claude Code writes the same message several times while it streams. Records are keyed by `message.id + requestId`, and only the last write (which has the final usage) is kept.
3. **Price.** Each record is priced with the table in [`src/pricing.ts`](src/pricing.ts): input, output, cache reads, and 5m/1h cache writes at their multipliers.
4. **Aggregate and render.** Pure functions group the records by day, hour, project and model, and Ink components draw the dashboard.
5. **Refresh.** Every 5 seconds, files whose size or mtime changed are re-read. Everything else comes from an in-memory cache, so refreshing stays cheap even with thousands of transcripts.

Malformed lines are never dropped silently. They are counted in the footer as `skipped`.

## About the numbers

- **Costs are estimates** at public API list prices. On a Claude Pro or Max subscription you are not billed per token, so read them as "what this usage would cost on the API".
- Models missing from the price table show a `?` before their cost, and their cost is not added to the totals.
- Prices change. If a model is missing or out of date, update [`src/pricing.ts`](src/pricing.ts) (pull requests welcome).

## Privacy

`rex-usage` only reads local files and never opens a network connection. The demo GIF uses synthetic data from [`scripts/demo-data.ts`](scripts/demo-data.ts). Keep that in mind before you share screenshots of your own dashboard: project names come from your working directories.

## Development

```sh
npm run dev           # run from source with tsx
npm run demo          # run on synthetic data
npm run typecheck
npm test              # node:test through tsx; fixtures in test/fixtures
npm run build         # compile to dist/
vhs demo/demo.tape    # re-record the demo (needs https://github.com/charmbracelet/vhs)
```

Project layout:

| Path | What it does |
| --- | --- |
| `src/scan.ts` | transcript reader, deduplication, incremental cache |
| `src/pricing.ts` | price table and cost function |
| `src/aggregate.ts` | pure aggregations (ranges, groups, daily and hourly buckets) |
| `src/format.ts` | number formatting, multi-row sparklines, bars |
| `src/ui/` | Ink components |
| `rex/rex-usage.lua` | Rex plugin |
| `scripts/demo-data.ts` | synthetic dataset generator |

## License

[MIT](LICENSE) © Alberto Barrago
