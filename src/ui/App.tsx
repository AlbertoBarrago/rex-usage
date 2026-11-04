import { Box, type Key, Text, useApp, useInput, useWindowSize } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  costByDay,
  type Group,
  groupBy,
  groupSessions,
  isLive,
  outputByHourToday,
  type Session,
  since,
  totals,
} from "../aggregate.js";
import { fmtDuration, fmtStamp, shortId, shortModel } from "../format.js";
import type { Scanner, ScanResult, UsageRecord } from "../scan.js";
import { Header } from "./Header.js";
import {
  drill,
  type Frame,
  type Level,
  type Move,
  moveCursor,
  pop,
  push,
  resolveCursor,
  type Root,
  ROOTS,
  rootStack,
  withCursor,
} from "./nav.js";
import { SessionDetail } from "./SessionDetail.js";
import { Spark } from "./Spark.js";
import { type Column, Table } from "./Table.js";

/** `null` means all time. */
const RANGES: ReadonlyArray<number | null> = [1, 7, 30, null];
const REFRESH_MS = 5_000;
/** Below this terminal height the header collapses to one line. */
const FULL_LAYOUT_MIN_ROWS = 34;
const SPARK_ROWS = 3;

/** Cycled with `s`: both agents together, or one at a time. */
export const SOURCE_FILTERS = ["all", "claude", "codex"] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];

interface Props {
  scanner: Scanner;
  initialDays: number | null;
  initialSource: SourceFilter;
  projectFilter?: string;
}

/** A plain printable key, used when replaying batched input. Typed as `Key` so new Ink fields fail the build. */
const NO_KEY: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
  hyper: false,
  capsLock: false,
  numLock: false,
};

const ROOT_TITLE: Record<Root, string> = { projects: "top projects", models: "models", sessions: "sessions" };

const modelsColumn: Column<Group> = {
  header: "models",
  width: 18,
  color: "#8787af",
  optional: true,
  cell: (g) => [...g.models].map(shortModel).join(","),
};

const sessionColumns = (withProject: boolean): Column<Session>[] => [
  { header: "started", width: 11, color: "#8787af", cell: (s) => fmtStamp(s.start) },
  { header: "dur", width: 5, cell: (s) => fmtDuration(s.end - s.start) },
  { header: "ag", width: 2, color: "#5f87af", cell: (s) => (s.source === "claude" ? "cc" : "cx") },
  ...(withProject
    ? [{ header: "project", width: 14, color: "#ffd75f", optional: true, cell: (s: Session) => s.project }]
    : []),
  { ...modelsColumn, width: 16 } as Column<Session>,
];

/** Breadcrumb segment of a frame. */
function crumb(f: Frame): string {
  if (f.kind === "root") return ROOT_TITLE[f.root];
  if (f.kind === "sessions") return f.value;
  return shortId(f.id);
}

/** What the table shows for the frame on top of the stack. */
type Pane =
  | { kind: "groups"; rows: Group[]; columns: Column<Group>[] }
  | { kind: "sessions"; rows: Session[]; columns: Column<Session>[] }
  | { kind: "session"; rows: Group[]; session: Session | undefined; records: UsageRecord[] };

function paneOf(frame: Frame, records: UsageRecord[]): Pane {
  if (frame.kind === "session") {
    const own = records.filter((r) => r.sessionId === frame.id);
    return {
      kind: "session",
      rows: groupBy(own, (r) => shortModel(r.model)),
      session: groupSessions(own)[0],
      records: own,
    };
  }
  if (frame.kind === "sessions") {
    const match =
      frame.by === "project"
        ? (r: UsageRecord) => r.project === frame.value
        : (r: UsageRecord) => shortModel(r.model) === frame.value;
    return { kind: "sessions", rows: groupSessions(records.filter(match)), columns: sessionColumns(frame.by !== "project") };
  }
  switch (frame.root) {
    case "projects":
      return { kind: "groups", rows: groupBy(records, (r) => r.project), columns: [modelsColumn] };
    case "models":
      return { kind: "groups", rows: groupBy(records, (r) => shortModel(r.model)), columns: [] };
    case "sessions":
      return { kind: "sessions", rows: groupSessions(records), columns: sessionColumns(true) };
  }
}

export function App({ scanner, initialDays, initialSource, projectFilter }: Props) {
  const { exit } = useApp();
  const [data, setData] = useState<ScanResult | null>(null);
  const [stack, setStack] = useState<Level[]>(() => rootStack("projects"));
  const [rangeIdx, setRangeIdx] = useState(() => Math.max(0, RANGES.indexOf(initialDays)));
  const [sourceIdx, setSourceIdx] = useState(() => Math.max(0, SOURCE_FILTERS.indexOf(initialSource)));
  const [tick, setTick] = useState(0);
  const [scanning, setScanning] = useState(false);
  const { columns: width, rows } = useWindowSize();
  // Fixed chrome around the table: ~22 lines in the full layout (3-row charts), ~18 compact.
  const compact = rows < FULL_LAYOUT_MIN_ROWS;
  const tableRows = Math.max(3, Math.min(10, rows - (compact ? 18 : 22)));

  const refresh = useCallback(async () => {
    setScanning(true);
    try {
      setData(await scanner.scan());
    } finally {
      setScanning(false);
      setTick((t) => t + 1);
    }
  }, [scanner]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const days = RANGES[rangeIdx] ?? null;
  const rangeLabel = days === null ? "all time" : days === 1 ? "today" : `${days} days`;
  const source = SOURCE_FILTERS[sourceIdx] ?? "all";
  const top = stack.at(-1)!;

  const view$ = useMemo(() => {
    if (!data) return null;
    const filter = projectFilter?.toLowerCase();
    const all = data.records.filter(
      (r) => (source === "all" || r.source === source) && (!filter || r.project.toLowerCase().includes(filter)),
    );
    const inRange = since(all, days);
    return {
      today: totals(since(all, 1)),
      week: totals(since(all, 7)),
      range: totals(inRange),
      daily: costByDay(all, days === null || days < 14 ? 30 : days),
      hourly: outputByHourToday(all),
      pane: paneOf(top.frame, inRange),
      now: Date.now(),
    };
  }, [data, days, source, projectFilter, top.frame]);

  const pane = view$?.pane;
  // Session detail is a leaf: its per-model table has no cursor.
  const keys = pane && pane.kind !== "session" ? pane.rows.map((r) => r.name) : [];
  const selected = pane && pane.kind !== "session" ? resolveCursor(keys, top.cursor) : undefined;

  const move = (m: Move) => setStack((s) => withCursor(s, moveCursor(keys, s.at(-1)!.cursor, m)));
  const half = Math.max(1, Math.floor(tableRows / 2));

  /** Single-key commands; split out so batched input can be replayed one char at a time. */
  const onKey = (input: string, key: Key) => {
    if (input === "q") exit();
    else if (key.escape || key.backspace || key.delete || key.leftArrow || input === "h") setStack(pop);
    else if (key.return || key.rightArrow || input === "l") {
      if (selected === undefined) return;
      const next = drill(top.frame, keys[selected]!);
      // Pin the cursor on the row being opened, so `back` lands on it even after a re-sort.
      if (next) setStack((s) => push(withCursor(s, { key: keys[selected]!, idx: selected }), next));
    } else if (key.ctrl && input === "d") move(half);
    else if (key.ctrl && input === "u") move(-half);
    else if (key.downArrow || input === "j") move(1);
    else if (key.upArrow || input === "k") move(-1);
    else if (key.pageDown) move(tableRows);
    else if (key.pageUp) move(-tableRows);
    else if (key.home || input === "g") move("top");
    else if (key.end || input === "G") move("bottom");
    else if (key.tab) {
      const root = stack[0]!.frame.kind === "root" ? stack[0]!.frame.root : "projects";
      setStack(rootStack(ROOTS[(ROOTS.indexOf(root) + 1) % ROOTS.length]!));
    } else if (input === "d") setRangeIdx((i) => (i + 1) % RANGES.length);
    else if (input === "s") setSourceIdx((i) => (i + 1) % SOURCE_FILTERS.length);
    else if (input === "r") void refresh();
  };

  useInput((input, key) => {
    // Key repeat or a fast `jjj` can reach us as one chunk: replay it per char.
    // Each char still sees this render's `keys`; moves compose via functional updates.
    if (input.length > 1 && !key.ctrl && !key.meta) for (const ch of input) onKey(ch, NO_KEY);
    else onKey(input, key);
  });

  if (!data || !view$ || !pane) {
    return <Text color="#ff5fd7">⠋ scanning transcripts …</Text>;
  }

  const title = `${stack.map((l) => crumb(l.frame)).join(" › ")} · ${rangeLabel} · ${source}${projectFilter ? ` · filter "${projectFilter}"` : ""}`;
  const chartRows = compact ? 1 : SPARK_ROWS;
  const canOpen = selected !== undefined;
  const k = (s: string) => <Text color="#8787ff">{s}</Text>;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header
        today={view$.today}
        week={view$.week}
        range={view$.range}
        rangeLabel={rangeLabel}
        active={data.activeSessions}
        tick={tick}
        compact={compact}
        source={source}
      />
      {pane.kind === "session" && pane.session ? (
        <SessionDetail session={pane.session} records={pane.records} width={width} height={chartRows} />
      ) : (
        <Spark daily={view$.daily} hourly={view$.hourly} height={chartRows} />
      )}
      {pane.kind === "sessions" ? (
        <Table
          title={title}
          rows={pane.rows}
          columns={pane.columns}
          label={(s) => shortId(s.id)}
          nameWidth={9}
          live={(s) => isLive(s, view$.now)}
          selected={selected}
          width={width}
          limit={tableRows}
        />
      ) : (
        <Table
          title={title}
          rows={pane.rows}
          columns={pane.kind === "groups" ? pane.columns : []}
          selected={selected}
          width={width}
          limit={tableRows}
        />
      )}
      {/* Key hints shrink first; the scan stats keep their width and a gap. */}
      <Box justifyContent="space-between" gap={2}>
        <Box flexShrink={1}>
          <Text dimColor wrap="truncate">
            {canOpen && (
              <>
                {k("j/k")} move  {k("⏎")} open{"  "}
              </>
            )}
            {stack.length > 1 && <>{k("esc")} back  </>}
            {k("tab")} view  {k("d")} range  {k("s")} source  {k("r")} refresh  {k("q")} quit
          </Text>
        </Box>
        <Box flexShrink={0}>
          <Text dimColor>
            {scanning ? "↻ " : ""}
            {data.records.length} msgs · skipped {data.skipped}
            {data.errors.length ? ` · ${data.errors.length} errors` : ""} · est. list $
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
