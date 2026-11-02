# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`rex-usage`: an Ink (React for the terminal) TUI that shows Claude Code token and cost usage by reading the transcripts in `~/.claude/projects/**/*.jsonl`. Meant to run in a Rex pane, but has no runtime dependency on Rex.

## Commands

```sh
npm run dev                 # run from source (tsx src/cli.tsx), flags after --: npm run dev -- -d all
npm run build               # tsc to dist/ + chmod +x dist/cli.js
npm run typecheck
npm test                    # tsx --test test/*.test.ts (node:test)
npx tsx --test test/scan.test.ts                         # single file
npx tsx --test --test-name-pattern="groupBy" test/*.test.ts   # single test
```

The installed `rex-usage` binary is a symlink `~/.local/bin/rex-usage -> dist/cli.js`, so `npm run build` is enough to update it. Don't delete `dist/` without rebuilding.

To check the real UI, open it in a Rex tab and capture the screen:
`rex window new -s "$REX_SESSION" Usage --focus=false --json -- rex-usage`, then `rex capture -s "$REX_SESSION" -b <block_id> --trim`. Use `rex send-key ... Tab` / `rex send ... d` to drive keys.

## Toolchain quirks

- ESM only (`"type": "module"`, `NodeNext`): relative imports in `src/` must use the `.js` extension.
- TypeScript 7: `@types/*` are not picked up automatically, hence `"types": ["node"]` in `tsconfig.json`.
- Ink 8: use `useWindowSize()` for terminal size (`useStdout().stdout` is typed as a WritableStream without `columns`). The app renders with `alternateScreen: true`.

## Architecture

Data flows one way: `Scanner` (I/O) -> `UsageRecord[]` -> pure functions in `aggregate.ts` -> Ink components.

- `src/scan.ts`: `parseLine` turns one transcript line into a `UsageRecord` (only `type: "assistant"` lines with `message.usage`; `<synthetic>` model skipped; malformed JSON throws so callers count it as `skipped`). Claude Code writes the same message several times while streaming, so records are deduped by `message.id:requestId` keeping the **last** write, both per file and globally across files. `Scanner` keeps a per-file cache keyed on mtime+size and re-reads only changed files on each 5s poll. Project name comes from `basename(cwd)`, falling back to the last segment of the project slug dir. Directories are read recursively because subagent transcripts live in `<session>/subagents/*.jsonl`.
- `src/pricing.ts`: list prices per model, matched by **first** prefix in the array, so more specific ids must come before shorter ones (`claude-opus-5-5` before `claude-opus-5`). Cache writes are 1.25x (5m) / 2x (1h) input; cache read defaults to 0.1x input unless set explicitly. Unknown models get `cost: undefined`, surfaced as `unpriced` and a `?` in the UI, never as 0 silently. Legacy transcripts with only aggregate `cache_creation_input_tokens` are counted as 5m writes.
- `src/aggregate.ts`: pure, `now`-injectable functions (range filtering by calendar day, totals, groupBy sorted by cost, daily/hourly buckets). Keep them pure so tests stay deterministic.
- `src/ui/App.tsx`: owns state (scan result, view projects/models, range 1/7/30/all, tick for the pulsing live dot) and the refresh interval; derives everything else with `useMemo`.
- `src/ui/Table.tsx`: each row is a single `<Text wrap="truncate">` with nested colored spans so lines never wrap; column widths and the share bar are computed from terminal width, and the models column is dropped below 110 columns. Keep this pattern when adding columns.

Costs are estimates at API list prices (Claude subscriptions are not billed per token); keep that framing in UI and docs.

## VCS

Jujutsu, colocated with git (`jj git init --colocate`). Bookmark `main`; no push unless asked.
