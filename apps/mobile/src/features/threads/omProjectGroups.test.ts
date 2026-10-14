import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { describe, expect, it } from "vite-plus/test";

import { groupActiveRowsByProject, type ThreadListV2ProjectGrouping } from "./omProjectGroups";

function row(id: string, projectId: string, options: { pinned?: boolean } = {}) {
  const thread = { id, projectId } as unknown as EnvironmentThreadShell;
  return { key: id, item: { thread, pinned: options.pinned === true } };
}

const grouping = (collapsed: string[] = []): ThreadListV2ProjectGrouping => ({
  groupOf: (thread) =>
    thread.projectId === "orphan"
      ? null
      : { key: `group-${thread.projectId}`, title: thread.projectId, project: null },
  order: ["group-b", "group-a"],
  collapsedKeys: new Set(collapsed),
});

const keys = (items: ReadonlyArray<{ key: string }>) => items.map((item) => item.key);

describe("groupActiveRowsByProject", () => {
  it("keeps pinned rows first, orders groups and keeps unknown projects last", () => {
    const result = groupActiveRowsByProject(
      [row("t1", "a"), row("t2", "b"), row("t3", "orphan"), row("t4", "a", { pinned: true })],
      grouping(),
      () => "ready",
    );
    expect(keys(result)).toEqual([
      "t4",
      "v2-project-group:group-b",
      "t2",
      "v2-project-group:group-a",
      "t1",
      "t3",
    ]);
    const headers = result.filter((item) => "type" in item && item.type === "v2-project-group");
    expect(headers.map((header) => "showDivider" in header && header.showDivider)).toEqual([
      true,
      true,
    ]);
  });

  it("hides collapsed rows but keeps the header with per-state counts", () => {
    const result = groupActiveRowsByProject(
      [row("t1", "a"), row("t2", "a")],
      grouping(["group-a"]),
      (thread) => (thread.id === "t1" ? "approval" : "ready"),
    );
    expect(result).toEqual([
      expect.objectContaining({
        type: "v2-project-group",
        collapsed: true,
        stateCounts: { approval: 1, input: 0, working: 0, failed: 0, ready: 1 },
        showDivider: false,
      }),
    ]);
  });
});
