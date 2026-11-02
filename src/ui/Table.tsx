import { Box, Text } from "ink";
import type { Group } from "../aggregate.js";
import { bar, fmtTokens, fmtUsd, shortModel, truncate } from "../format.js";

interface Props {
  title: string;
  groups: Group[];
  showModels: boolean;
  /** Terminal width, used to size columns so rows never wrap. */
  width: number;
  limit?: number;
}

const NAME = 16;
const MODELS = 18;
const NUM = 7;
const NUM_COLS = 5;
/** App paddingX + border + table paddingX on both sides. */
const CHROME = 6;
/** Below this terminal width the models column is dropped. */
const MODELS_MIN_WIDTH = 110;

const num = (v: string) => v.padStart(NUM);

export function Table({ title, groups, showModels, width, limit = 10 }: Props) {
  const rows = groups.slice(0, limit);
  const max = Math.max(...rows.map((g) => g.cost), 0);
  const withModels = showModels && width >= MODELS_MIN_WIDTH;
  const fixed = NAME + 1 + (withModels ? MODELS + 1 : 0) + NUM * NUM_COLS + 2;
  const barWidth = Math.max(4, width - CHROME - fixed);

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="#5f5f87" paddingX={1}>
      <Text bold color="#ff5fd7" wrap="truncate">
        {title}
      </Text>
      <Text dimColor wrap="truncate">
        {"name".padEnd(NAME)} {withModels ? `${"models".padEnd(MODELS)} ` : ""}
        {num("in")}
        {num("out")}
        {num("c.read")}
        {num("c.wrt")}
        {num("cost")}
        {"  share"}
      </Text>
      {rows.length === 0 && <Text dimColor>no usage in this range</Text>}
      {rows.map((g, i) => (
        // One Text per row with nested colored spans: Ink then truncates the
        // whole line instead of wrapping individual cells.
        <Text key={g.name} wrap="truncate">
          <Text color={i === 0 ? "#ffd75f" : undefined}>{truncate(g.name, NAME)} </Text>
          {withModels && <Text color="#8787af">{truncate([...g.models].map(shortModel).join(","), MODELS)} </Text>}
          <Text>{num(fmtTokens(g.input))}</Text>
          <Text color="#5fd7ff">{num(fmtTokens(g.output))}</Text>
          <Text color="#87d787">{num(fmtTokens(g.cacheRead))}</Text>
          <Text>{num(fmtTokens(g.cacheWrite))}</Text>
          <Text color="#ffaf5f">{num(`${g.unpriced ? "?" : ""}${fmtUsd(g.cost)}`)}</Text>
          <Text color="#ff5f87">{"  "}{bar(max ? g.cost / max : 0, barWidth)}</Text>
        </Text>
      ))}
      {groups.length > limit && <Text dimColor>+{groups.length - limit} more</Text>}
    </Box>
  );
}
