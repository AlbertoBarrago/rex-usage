import { Box, Text } from "ink";
import { cacheHitRatio, type Totals } from "../aggregate.js";
import { fmtPct, fmtTokens, fmtUsd } from "../format.js";

const BANNER = [
  "█▀█ █▀▀ ▀▄▀ ╱╱ █ █ █▀ ▄▀█ █▀▀ █▀▀",
  "█▀▄ ██▄ █ █ ╱╱ █▄█ ▄█ █▀█ █▄█ ██▄",
];
/** Vertical gradient, one color per banner row. */
const GRADIENT = ["#ff5fd7", "#8787ff"];

interface Props {
  today: Totals;
  week: Totals;
  range: Totals;
  rangeLabel: string;
  active: number;
  tick: number;
  /** Single-line title instead of the two-row banner, for short panes. */
  compact: boolean;
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Box flexDirection="column" marginRight={2} flexShrink={0}>
      <Text dimColor>{label}</Text>
      <Text bold color={color}>
        {value}
      </Text>
    </Box>
  );
}

export function Header({ today, week, range, rangeLabel, active, tick, compact }: Props) {
  // Pulsing dot: alternates every refresh tick while sessions are live.
  const dot = active > 0 ? (tick % 2 ? "●" : "○") : "·";
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        {compact ? (
          <Text bold color={GRADIENT[0]}>
            REX<Text color={GRADIENT[1]}>//USAGE</Text>
          </Text>
        ) : (
          <Box flexDirection="column">
            {BANNER.map((line, i) => (
              <Text key={i} color={GRADIENT[i]}>
                {line}
              </Text>
            ))}
          </Box>
        )}
        <Box flexDirection="column" alignItems="flex-end">
          <Text color={active > 0 ? "green" : "gray"}>
            {dot} {active} live session{active === 1 ? "" : "s"}
          </Text>
          {!compact && <Text dimColor>claude code token telemetry</Text>}
        </Box>
      </Box>
      <Box marginTop={compact ? 0 : 1} borderStyle="round" borderColor="#5f5f87" paddingX={1}>
        <Kpi label="today" value={fmtUsd(today.cost)} color="#ffd75f" />
        <Kpi label="7 days" value={fmtUsd(week.cost)} color="#ffaf5f" />
        {/* Only add a range cost tile when it differs from the two fixed ones. */}
        {rangeLabel !== "today" && rangeLabel !== "7 days" && (
          <Kpi label={rangeLabel} value={fmtUsd(range.cost)} color="#ff875f" />
        )}
        <Kpi label="out tokens" value={fmtTokens(range.output)} color="#5fd7ff" />
        <Kpi label="cache read" value={fmtTokens(range.cacheRead)} color="#87d787" />
        <Kpi label="cache hit" value={fmtPct(cacheHitRatio(range))} color="#afff87" />
        <Kpi label="msgs" value={fmtTokens(range.messages)} color="#d7afff" />
      </Box>
    </Box>
  );
}
