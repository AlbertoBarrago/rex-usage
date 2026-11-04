import { Box, Text } from "ink";
import { burnRate, cacheHitRatio, isLive, outputOverTime, type Session } from "../aggregate.js";
import { fmtClock, fmtDuration, fmtPct, fmtStamp, fmtTokens, fmtUsd, shortId } from "../format.js";
import type { UsageRecord } from "../scan.js";
import { Chart } from "./Spark.js";

interface Props {
  session: Session;
  /** All records of the session (within the current range). */
  records: UsageRecord[];
  /** Terminal width; the chart spans the whole pane. */
  width: number;
  /** Chart rows: 3 in the full layout, 1 in compact panes. */
  height: number;
}

/** App paddingX on both sides. */
const CHROME = 2;

/**
 * Session telemetry strip, shown in place of the global charts while a session
 * is open: one summary line, an output-over-time chart spanning the session's
 * wall-clock duration, and a time axis. Same height as `Spark`, so the table
 * below keeps its row budget.
 */
export function SessionDetail({ session: s, records, width, height }: Props) {
  const cols = Math.max(10, width - CHROME);
  const series = outputOverTime(records, s.start, s.end, cols);
  const peak = Math.max(...series, 0);
  const left = fmtStamp(s.start);
  const right = fmtClock(s.end);
  const mid = ` out tokens / ${fmtDuration((s.end - s.start) / cols)} slice · peak ${fmtTokens(peak)} `;
  const fill = Math.max(0, cols - left.length - right.length - mid.length);
  const axis =
    fill >= 2
      ? `${left}${"─".repeat(Math.floor(fill / 2))}${mid}${"─".repeat(Math.ceil(fill / 2))}${right}`
      : `${left}${" ".repeat(Math.max(1, cols - left.length - right.length))}${right}`;
  const live = isLive(s);

  return (
    <Box marginTop={1} flexDirection="column">
      <Text wrap="truncate">
        <Text color={live ? "green" : "#5f5f87"}>{live ? "● " : "◆ "}</Text>
        <Text bold color="#ff5fd7">
          {shortId(s.id)}
        </Text>
        <Text dimColor> · </Text>
        <Text color="#ffd75f">{s.project}</Text>
        <Text dimColor> · {s.source} · </Text>
        <Text>{fmtDuration(s.end - s.start)}</Text>
        <Text dimColor> · </Text>
        <Text bold color="#ffaf5f">
          {s.unpriced ? "?" : ""}
          {fmtUsd(s.cost)}
        </Text>
        <Text dimColor> · </Text>
        <Text color="#ff875f">{fmtUsd(burnRate(s))}/h</Text>
        <Text dimColor> · cache </Text>
        <Text color="#afff87">{fmtPct(cacheHitRatio(s))}</Text>
        <Text dimColor> · </Text>
        <Text color="#d7afff">{s.messages} msgs</Text>
      </Text>
      <Chart values={series} height={height} />
      <Text dimColor wrap="truncate">
        {axis}
      </Text>
    </Box>
  );
}
