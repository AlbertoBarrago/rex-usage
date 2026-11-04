/**
 * Pure drill-down navigation state: a stack of frames, each with its own
 * cursor, so going back restores where you were.
 */

/** Top-level views, cycled with `tab`. */
export const ROOTS = ["projects", "models", "sessions"] as const;
export type Root = (typeof ROOTS)[number];

export type Frame =
  | { kind: "root"; root: Root }
  | { kind: "sessions"; by: "project" | "model"; value: string }
  | { kind: "session"; id: string };

/**
 * Cursor anchored to the row key, with the last index as fallback: the 5s
 * refresh re-sorts rows by cost or recency, and the selection must follow the
 * row, not stay on a position that now shows something else.
 */
export interface Cursor {
  key: string | null;
  idx: number;
}

export interface Level {
  frame: Frame;
  cursor: Cursor;
}

export type Move = number | "top" | "bottom";

export function rootStack(root: Root): Level[] {
  return [{ frame: { kind: "root", root }, cursor: { key: null, idx: 0 } }];
}

/** Index of the cursor in `keys`, or `undefined` for an empty list. */
export function resolveCursor(keys: readonly string[], c: Cursor): number | undefined {
  if (keys.length === 0) return undefined;
  const i = c.key === null ? -1 : keys.indexOf(c.key);
  return i >= 0 ? i : Math.min(Math.max(0, c.idx), keys.length - 1);
}

/** Moves by a relative delta (clamped, no wrap) or to either end. */
export function moveCursor(keys: readonly string[], c: Cursor, move: Move): Cursor {
  const cur = resolveCursor(keys, c);
  if (cur === undefined) return c;
  const last = keys.length - 1;
  const idx = move === "top" ? 0 : move === "bottom" ? last : Math.min(last, Math.max(0, cur + move));
  return { key: keys[idx]!, idx };
}

/** Replaces the cursor of the top level. */
export function withCursor(stack: Level[], cursor: Cursor): Level[] {
  return [...stack.slice(0, -1), { ...stack.at(-1)!, cursor }];
}

export function push(stack: Level[], frame: Frame): Level[] {
  return [...stack, { frame, cursor: { key: null, idx: 0 } }];
}

/** Pops one level; the root is never popped. */
export function pop(stack: Level[]): Level[] {
  return stack.length > 1 ? stack.slice(0, -1) : stack;
}

/** Where `enter` leads from a frame, given the selected row key; `null` for leaves. */
export function drill(frame: Frame, key: string): Frame | null {
  if (frame.kind === "session") return null;
  if (frame.kind === "sessions" || frame.root === "sessions") return { kind: "session", id: key };
  return { kind: "sessions", by: frame.root === "projects" ? "project" : "model", value: key };
}
