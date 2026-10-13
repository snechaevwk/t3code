import { describe, expect, it } from "vite-plus/test";

import { buildProjectSections, groupThreadsByProject } from "./sidebarProjectGroups";

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

describe("buildProjectSections", () => {
  it("lists every project, splits settled threads and empties collapsed sections", () => {
    const sections = buildProjectSections({
      active: [thread("a1", "a"), thread("x1", "x"), thread("c1", "c")],
      settled: [thread("a2", "a"), thread("y1", "y"), thread("c2", "c")],
      groupKeyOf,
      groupOrder: ["a", "b", "c"],
      isCollapsed: (key) => key === "c",
    });
    expect(
      sections.map((section) => [
        section.groupKey,
        section.active.map(keyOf),
        section.settled.map(keyOf),
        section.collapsed,
      ]),
    ).toEqual([
      ["a", ["a1"], ["a2"], false],
      ["b", [], [], false],
      ["c", [], ["c2"], true],
      ["x", ["x1"], [], false],
      ["y", [], ["y1"], false],
    ]);
  });
});
