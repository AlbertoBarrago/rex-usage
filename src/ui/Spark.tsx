import { Box, Text } from "ink";
import { fmtTokens, fmtUsd, sparkRows } from "../format.js";

interface Props {
  daily: number[];
  hourly: number[];
  /** Rows per chart: 3 in the full layout, 1 in compact panes. */
  height: number;
}

/** Column colors from cool to hot by the column's value relative to the max. */
const HEAT = ["#5f5f87", "#5f87af", "#5fafd7", "#5fd7d7", "#87d787", "#d7d75f", "#ffaf5f", "#ff5f87"];

function heatColor(v: number, max: number): string {
  if (max === 0 || v <= 0) return HEAT[0]!;
  return HEAT[Math.min(HEAT.length - 1, Math.ceil((v / max) * (HEAT.length - 1)))]!;
}

export function Chart({ values, height }: { values: number[]; height: number }) {
  const max = Math.max(...values, 0);
  const colors = values.map((v) => heatColor(v, max));
  return (
    <Box flexDirection="column">
      {sparkRows(values, height).map((row, r) => (
        <Text key={r}>
          {[...row].map((ch, i) => (
            <Text key={i} color={colors[i]}>
              {ch}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}

export function Spark({ daily, hourly, height }: Props) {
  const peakDay = Math.max(...daily, 0);
  const peakHour = Math.max(...hourly, 0);
  const nowHour = new Date().getHours();
  return (
    <Box marginTop={1} gap={4}>
      <Box flexDirection="column">
        <Text dimColor>
          cost / day · last {daily.length}d · peak {fmtUsd(peakDay)}
        </Text>
        <Chart values={daily} height={height} />
      </Box>
      <Box flexDirection="column">
        <Text dimColor>out tokens / hour · today · peak {fmtTokens(peakHour)}</Text>
        <Chart values={hourly} height={height} />
        <Text dimColor>{"".padEnd(nowHour)}^</Text>
      </Box>
    </Box>
  );
}
