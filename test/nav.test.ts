import assert from "node:assert/strict";
import { test } from "node:test";
import { drill, moveCursor, pop, push, resolveCursor, rootStack, withCursor } from "../src/ui/nav.js";
import { viewportStart } from "../src/ui/Table.js";

test("cursor follows its row across re-sorts, falls back to the last index", () => {
  assert.equal(resolveCursor(["a", "b", "c"], { key: "b", idx: 1 }), 1);
  assert.equal(resolveCursor(["b", "c", "a"], { key: "b", idx: 1 }), 0);
  assert.equal(resolveCursor(["x", "y"], { key: "gone", idx: 5 }), 1);
  assert.equal(resolveCursor([], { key: null, idx: 0 }), undefined);
});

test("moveCursor clamps and jumps", () => {
  const keys = ["a", "b", "c", "d"];
  const at = (key: string) => ({ key, idx: keys.indexOf(key) });
  assert.deepEqual(moveCursor(keys, at("b"), 1), { key: "c", idx: 2 });
  assert.deepEqual(moveCursor(keys, at("b"), -10), { key: "a", idx: 0 });
  assert.deepEqual(moveCursor(keys, at("b"), 10), { key: "d", idx: 3 });
  assert.deepEqual(moveCursor(keys, at("c"), "top"), { key: "a", idx: 0 });
  assert.deepEqual(moveCursor(keys, at("a"), "bottom"), { key: "d", idx: 3 });
});

test("drill: groups -> sessions -> session -> leaf", () => {
  assert.deepEqual(drill({ kind: "root", root: "projects" }, "p"), { kind: "sessions", by: "project", value: "p" });
  assert.deepEqual(drill({ kind: "root", root: "models" }, "m"), { kind: "sessions", by: "model", value: "m" });
  assert.deepEqual(drill({ kind: "root", root: "sessions" }, "s"), { kind: "session", id: "s" });
  assert.deepEqual(drill({ kind: "sessions", by: "project", value: "p" }, "s"), { kind: "session", id: "s" });
  assert.equal(drill({ kind: "session", id: "s" }, "x"), null);
});

test("stack keeps per-level cursors and never pops the root", () => {
  let s = withCursor(rootStack("projects"), { key: "p", idx: 3 });
  s = push(s, { kind: "sessions", by: "project", value: "p" });
  assert.deepEqual(s.at(-1)!.cursor, { key: null, idx: 0 });
  s = pop(s);
  assert.deepEqual(s.at(-1)!.cursor, { key: "p", idx: 3 });
  assert.equal(pop(s), s);
});

test("viewport keeps the cursor centered within bounds", () => {
  assert.equal(viewportStart(5, 10, 4), 0);
  assert.equal(viewportStart(50, 10, 0), 0);
  assert.equal(viewportStart(50, 10, 20), 15);
  assert.equal(viewportStart(50, 10, 49), 40);
  assert.equal(viewportStart(50, 10, undefined), 0);
});
