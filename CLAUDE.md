# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`rex-usage`: an Ink (React for the terminal) TUI that shows Claude Code and Codex token and cost usage by reading the transcripts in `~/.claude/projects/**/*.jsonl` and the Codex rollouts in `~/.codex/{sessions,archived_sessions}/**/*.jsonl`. Meant to run in a Rex pane, but has no runtime dependency on Rex.

## Commands

```sh
npm run dev                 # run from source (tsx src/cli.tsx), flags after --: npm run dev -- -d all
npm run demo                # run on synthetic data (scripts/demo-data.ts)
npm run build               # tsc to dist/ + chmod +x dist/cli.js
npm run typecheck
npm test                    # tsx --test test/*.test.ts (node:test)
npx tsx --test test/scan.test.ts                         # single file
npx tsx --test --test-name-pattern="groupBy" test/*.test.ts   # single test
```

To check the real UI, open it in a Rex tab and capture the screen:
`rex window new -s "$REX_SESSION" Usage --focus=false --json -- rex-usage`, then `rex capture -s "$REX_SESSION" -b <block_id> --trim`. Use `rex send-key ... Tab` / `rex send ... d` to drive keys.

Public material (README GIF, Discord MP4) must only use synthetic data: re-record with `npm run build && vhs demo/demo.tape`. Never record or screenshot real transcripts: project names come from real working directories. Any demo run must point both `--root` and `--codex-home` (or `REX_USAGE_ROOT` and `REX_USAGE_CODEX_HOME`) at the synthetic tree, otherwise real Codex data leaks in.

## Rex plugin

`rex/rex-usage.lua` defines the `rex_usage` action (split beside the focused pane via `rex.session.new_split`, bound to `ctrl+b>u`). Rex runs commands through a non-interactive login shell that skips `~/.zshrc`, hence `path_prepend`. `rex.action` fields like `keywords` must be strings, not tables. Validate with `rex config check`.

## Toolchain quirks

- ESM only (`"type": "module"`, `NodeNext`): relative imports in `src/` must use the `.js` extension.
- TypeScript 7: `@types/*` are not picked up automatically, hence `"types": ["node"]` in `tsconfig.json`.
- Ink 8: use `useWindowSize()` for terminal size (`useStdout().stdout` is typed as a WritableStream without `columns`). The app renders with `alternateScreen: true`.

## Architecture

Data flows one way: `Scanner` (I/O) over a list of `SourceSpec`s -> `UsageRecord[]` (each tagged `source: "claude" | "codex"`) -> pure functions in `aggregate.ts` -> Ink components.

- `src/scan.ts`: `parseLine` turns one transcript line into a `UsageRecord` (only `type: "assistant"` lines with `message.usage`; `<synthetic>` model skipped; malformed JSON throws so callers count it as `skipped`). Claude Code writes the same message several times while streaming, so records are deduped by `message.id:requestId` keeping the **last** write, both per file and globally across files. `Scanner` keeps a per-file cache keyed on mtime+size and re-reads only changed files on each 5s poll. Project name comes from `basename(cwd)`, falling back to the last segment of the project slug dir. Directories are read recursively because subagent transcripts live in `<session>/subagents/*.jsonl`. `Scanner` takes `SourceSpec[]` (root + per-file reader); an `optional` source with a missing root is silent, which is how a machine without Codex works.
- `src/codex.ts`: `CodexParser` is stateful per file: `token_count` events carry no model or cwd, so those come from the latest `turn_context` / `session_meta`. Uses `last_token_usage`; `cached_input_tokens` is a subset of `input_tokens` and becomes `cacheRead` (input is the remainder), reasoning is already in output. Events repeating the previous `total_token_usage` are dropped; the key `codex:<timestamp>:<total_tokens>` dedups forked sessions that copy history across files.
- `src/pricing.ts`: list prices per model, matched by **first** prefix in the array, so more specific ids must come before shorter ones (`claude-opus-5-5` before `claude-opus-5`). Cache writes are 1.25x (5m) / 2x (1h) input; cache read defaults to 0.1x input unless set explicitly. OpenAI entries carry a `longContext` tier (prompt > 272K tokens) applied to the whole request. Unknown models get `cost: undefined`, surfaced as `unpriced` and a `?` in the UI, never as 0 silently. Legacy transcripts with only aggregate `cache_creation_input_tokens` are counted as 5m writes.
- `src/aggregate.ts`: pure, `now`-injectable functions (range filtering by calendar day, totals, groupBy sorted by cost, daily/hourly buckets). Keep them pure so tests stay deterministic.
- `src/ui/App.tsx`: owns state (scan result, navigation stack, range 1/7/30/all, source all/claude/codex on `s`, tick for the pulsing live dot) and the refresh interval; derives the pane of the top frame with `useMemo`. `esc` goes back and never quits; only `q` quits. Multi-char input chunks (key repeat, `rex send jjj`) are replayed per char.
- `src/ui/nav.ts`: pure drill-down state. A stack of `Level`s (frame + cursor): root `projects|models|sessions` (cycled with `tab`) -> `sessions` filtered by project or model -> `session` leaf. Cursors are anchored to the row key with the last index as fallback, because the 5s refresh re-sorts rows. `groupSessions` in `aggregate.ts` sorts by most recent activity, groups by cost.
- `src/ui/SessionDetail.tsx`: replaces `Spark` while a session is open, with the same height, so the table row budget does not change.
- Layout adapts to `useWindowSize()`: below 34 rows the header collapses to one line and charts drop from 3 rows to 1; the table row count is derived from the remaining height.
- `src/ui/Table.tsx`: generic over `Group` rows with a list of text `Column`s; each row is a single `<Text wrap="truncate">` with nested colored spans so lines never wrap; column widths and the share bar are computed from terminal width, and `optional` columns are dropped below 110 columns. Keep this pattern when adding columns. With a cursor it scrolls a viewport centered on the selection (`viewportStart`).

Costs are estimates at API list prices (Claude and ChatGPT/Codex subscriptions are not billed per token); keep that framing in UI and docs.

## VCS

Plain `git` (no jj): one branch per task off `main`; no push unless asked.
