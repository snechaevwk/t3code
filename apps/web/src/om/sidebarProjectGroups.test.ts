import { describe, expect, it } from "vite-plus/test";

import { groupThreadsByProject, placeGroupHeaders } from "./sidebarProjectGroups";

const thread = (id: string, project: string) => ({ id, project });
const groupKeyOf = (entry: { project: string }) => entry.project;
const keyOf = (entry: { id: string }) => entry.id;

describe("groupThreadsByProject", () => {
  it("orders groups by project order and keeps thread order within a group", () => {
    const groups = groupThreadsByProject(
      [thread("a1", "a"), thread("b1", "b"), thread("x1", "x"), thread("a2", "a")],
      groupKeyOf,
      ["b", "a"],
    );
    expect(groups.map((group) => [group.groupKey, group.threads.map(keyOf)])).toEqual([
      ["b", ["b1"]],
      ["a", ["a1", "a2"]],
      ["x", ["x1"]],
    ]);
  });
});

describe("placeGroupHeaders", () => {
  it("puts collapsed groups ahead of the next visible thread or in the tail", () => {
    const groups = groupThreadsByProject(
      [thread("a1", "a"), thread("b1", "b"), thread("c1", "c"), thread("d1", "d")],
      groupKeyOf,
      ["a", "b", "c", "d"],
    );
    const collapsed = new Set(["b", "d"]);
    const placement = placeGroupHeaders(groups, (entry) => !collapsed.has(entry.project), keyOf);
    expect([...placement.beforeThread]).toEqual([
      ["a1", ["a"]],
      ["c1", ["b", "c"]],
    ]);
    expect(placement.trailing).toEqual(["d"]);
  });
});
