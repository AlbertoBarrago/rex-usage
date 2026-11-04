import { Box, Text } from "ink";
import type { Group } from "../aggregate.js";
import { bar, fmtTokens, fmtUsd, truncate } from "../format.js";

/** A text column between the name and the numeric columns. */
export interface Column<R> {
  header: string;
  width: number;
  color?: string;
  /** Dropped below `OPTIONAL_MIN_WIDTH` terminal columns. */
  optional?: boolean;
  cell(row: R): string;
}

interface Props<R extends Group> {
  title: string;
  rows: R[];
  columns: Column<R>[];
  /** Text of the name column; defaults to `row.name`. */
  label?(row: R): string;
  /** Width of the name column. */
  nameWidth?: number;
  /** Rows flagged here get a green dot in the gutter. */
  live?(row: R): boolean;
  /** Cursor index into `rows`; `undefined` renders a static table without a cursor. */
  selected?: number;
  /** Terminal width, used to size columns so rows never wrap. */
  width: number;
  limit?: number;
}

const NAME_WIDTH = 16;
const NUM = 7;
const NUM_COLS = 5;
const GUTTER = 2;
/** App paddingX + border + table paddingX on both sides. */
const CHROME = 6;
/** Below this terminal width optional columns are dropped. */
const OPTIONAL_MIN_WIDTH = 110;

const num = (v: string) => v.padStart(NUM);

/**
 * First visible row for a viewport of `limit` rows that keeps `selected`
 * centered (vim `scrolloff=999`). Stateless, so a refresh that reorders rows
 * never leaves the cursor off screen.
 */
export function viewportStart(total: number, limit: number, selected: number | undefined): number {
  if (selected === undefined || total <= limit) return 0;
  return Math.max(0, Math.min(total - limit, selected - Math.floor(limit / 2)));
}

export function Table<R extends Group>({
  title,
  rows,
  columns,
  label,
  nameWidth: NAME = NAME_WIDTH,
  live,
  selected,
  width,
  limit = 10,
}: Props<R>) {
  const cols = columns.filter((c) => !c.optional || width >= OPTIONAL_MIN_WIDTH);
  const gutter = selected !== undefined || live !== undefined;
  const start = viewportStart(rows.length, limit, selected);
  const visible = rows.slice(start, start + limit);
  // Share is relative to the whole list, so bars stay comparable while scrolling.
  const max = Math.max(...rows.map((g) => g.cost), 0);
  const fixed =
    (gutter ? GUTTER : 0) + NAME + 1 + cols.reduce((n, c) => n + c.width + 1, 0) + NUM * NUM_COLS + 2;
  const barWidth = Math.max(4, width - CHROME - fixed);
  const below = rows.length - start - visible.length;

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="#5f5f87" paddingX={1}>
      <Text bold color="#ff5fd7" wrap="truncate">
        {title}
        {selected !== undefined && rows.length > 0 && (
          <Text bold={false} dimColor>
            {"  "}[{selected + 1}/{rows.length}]
          </Text>
        )}
      </Text>
      <Text dimColor wrap="truncate">
        {gutter ? " ".repeat(GUTTER) : ""}
        {"name".padEnd(NAME)} {cols.map((c) => `${c.header.padEnd(c.width)} `).join("")}
        {num("in")}
        {num("out")}
        {num("c.read")}
        {num("c.wrt")}
        {num("cost")}
        {"  share"}
      </Text>
      {rows.length === 0 && <Text dimColor>no usage in this range</Text>}
      {visible.map((g, j) => {
        const i = start + j;
        const sel = i === selected;
        return (
          // One Text per row with nested colored spans: Ink then truncates the
          // whole line instead of wrapping individual cells.
          <Text key={g.name} wrap="truncate">
            {gutter && (
              <Text>
                <Text color="#ff5fd7">{sel ? "▸" : " "}</Text>
                <Text color="green">{live?.(g) ? "●" : " "}</Text>
              </Text>
            )}
            <Text color={sel ? "#ff5fd7" : i === 0 ? "#ffd75f" : undefined} inverse={sel} bold={sel}>
              {truncate(label ? label(g) : g.name, NAME)}
            </Text>{" "}
            {cols.map((c) => (
              <Text key={c.header} color={c.color}>
                {truncate(c.cell(g), c.width)}{" "}
              </Text>
            ))}
            <Text>{num(fmtTokens(g.input))}</Text>
            <Text color="#5fd7ff">{num(fmtTokens(g.output))}</Text>
            <Text color="#87d787">{num(fmtTokens(g.cacheRead))}</Text>
            <Text>{num(fmtTokens(g.cacheWrite))}</Text>
            <Text color="#ffaf5f">{num(`${g.unpriced ? "?" : ""}${fmtUsd(g.cost)}`)}</Text>
            <Text color="#ff5f87">
              {"  "}
              {bar(max ? g.cost / max : 0, barWidth)}
            </Text>
          </Text>
        );
      })}
      {rows.length > limit && (
        <Text dimColor>
          {start > 0 ? `▲ ${start} above` : ""}
          {start > 0 && below > 0 ? " · " : ""}
          {below > 0 ? `▼ ${below} below` : ""}
        </Text>
      )}
    </Box>
  );
}
