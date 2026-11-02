import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";
import { costByDay, groupBy, outputByHourToday, since, totals } from "../aggregate.js";
import { shortModel } from "../format.js";
import type { Scanner, ScanResult } from "../scan.js";
import { Header } from "./Header.js";
import { Spark } from "./Spark.js";
import { Table } from "./Table.js";

/** `null` means all time. */
const RANGES: ReadonlyArray<number | null> = [1, 7, 30, null];
const REFRESH_MS = 5_000;

interface Props {
  scanner: Scanner;
  initialDays: number | null;
  projectFilter?: string;
}

type View = "projects" | "models";

export function App({ scanner, initialDays, projectFilter }: Props) {
  const { exit } = useApp();
  const [data, setData] = useState<ScanResult | null>(null);
  const [view, setView] = useState<View>("projects");
  const [rangeIdx, setRangeIdx] = useState(() => Math.max(0, RANGES.indexOf(initialDays)));
  const [tick, setTick] = useState(0);
  const [scanning, setScanning] = useState(false);
  const { columns: width } = useWindowSize();

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

  useInput((input, key) => {
    if (input === "q" || key.escape) exit();
    else if (key.tab) setView((v) => (v === "projects" ? "models" : "projects"));
    else if (input === "d") setRangeIdx((i) => (i + 1) % RANGES.length);
    else if (input === "r") void refresh();
  });

  const days = RANGES[rangeIdx] ?? null;
  const rangeLabel = days === null ? "all time" : days === 1 ? "today" : `${days} days`;

  const view$ = useMemo(() => {
    if (!data) return null;
    const filter = projectFilter?.toLowerCase();
    const all = filter ? data.records.filter((r) => r.project.toLowerCase().includes(filter)) : data.records;
    const inRange = since(all, days);
    const groups =
      view === "projects" ? groupBy(inRange, (r) => r.project) : groupBy(inRange, (r) => shortModel(r.model));
    return {
      today: totals(since(all, 1)),
      week: totals(since(all, 7)),
      range: totals(inRange),
      daily: costByDay(all, days === null || days < 14 ? 30 : days),
      hourly: outputByHourToday(all),
      groups,
    };
  }, [data, days, view, projectFilter]);

  if (!data || !view$) {
    return <Text color="#ff5fd7">⠋ scanning ~/.claude/projects …</Text>;
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header
        today={view$.today}
        week={view$.week}
        range={view$.range}
        rangeLabel={rangeLabel}
        active={data.activeSessions}
        tick={tick}
      />
      <Spark daily={view$.daily} hourly={view$.hourly} />
      <Table
        title={`${view === "projects" ? "top projects" : "models"} · ${rangeLabel}${projectFilter ? ` · filter "${projectFilter}"` : ""}`}
        groups={view$.groups}
        showModels={view === "projects"}
        width={width}
      />
      <Box justifyContent="space-between">
        <Text dimColor wrap="truncate">
          <Text color="#8787ff">tab</Text> view  <Text color="#8787ff">d</Text> range  <Text color="#8787ff">r</Text>{" "}
          refresh  <Text color="#8787ff">q</Text> quit
        </Text>
        <Text dimColor wrap="truncate">
          {scanning ? "↻ " : ""}
          {data.records.length} msgs · skipped {data.skipped}
          {data.errors.length ? ` · ${data.errors.length} errors` : ""} · est. list $
        </Text>
      </Box>
    </Box>
  );
}
