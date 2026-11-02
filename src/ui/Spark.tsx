import { Box, Text } from "ink";
import { fmtTokens, fmtUsd, sparkline } from "../format.js";

interface Props {
  daily: number[];
  hourly: number[];
}

/** Colors sparkline cells from cool to hot by their level. */
const HEAT = ["#5f5f87", "#5f87af", "#5fafd7", "#5fd7d7", "#87d787", "#d7d75f", "#ffaf5f", "#ff5f87"];
const LEVELS = "▁▂▃▄▅▆▇█";

function Heat({ line }: { line: string }) {
  return (
    <Text>
      {[...line].map((ch, i) => (
        <Text key={i} color={HEAT[LEVELS.indexOf(ch)] ?? "gray"}>
          {ch}
        </Text>
      ))}
    </Text>
  );
}

export function Spark({ daily, hourly }: Props) {
  const peakDay = Math.max(...daily, 0);
  const peakHour = Math.max(...hourly, 0);
  const nowHour = new Date().getHours();
  return (
    <Box marginTop={1} gap={4}>
      <Box flexDirection="column">
        <Text dimColor>
          cost / day · last {daily.length}d · peak {fmtUsd(peakDay)}
        </Text>
        <Heat line={sparkline(daily)} />
      </Box>
      <Box flexDirection="column">
        <Text dimColor>out tokens / hour · today · peak {fmtTokens(peakHour)}</Text>
        <Heat line={sparkline(hourly)} />
        <Text dimColor>{"".padEnd(nowHour)}^</Text>
      </Box>
    </Box>
  );
}
