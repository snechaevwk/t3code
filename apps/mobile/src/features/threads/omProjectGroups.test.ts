import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { describe, expect, it } from "vite-plus/test";

import { groupActiveRowsByProject, type ThreadListV2ProjectGrouping } from "./omProjectGroups";

function row(id: string, projectId: string, options: { pinned?: boolean; costUsd?: number } = {}) {
  const thread = {
    id,
    projectId,
    usage:
      options.costUsd === undefined
        ? undefined
        : {
            turns: 1,
            inputTokens: 1_000,
            cachedInputTokens: 0,
            outputTokens: 500,
            reasoningTokens: 0,
            estimatedCostUsd: options.costUsd,
            unpricedTurns: 0,
          },
  } as unknown as EnvironmentThreadShell;
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

  it("hides collapsed rows but keeps the header with its count and usage", () => {
    const result = groupActiveRowsByProject(
      [row("t1", "a", { costUsd: 0.5 }), row("t2", "a", { costUsd: 0.25 })],
      grouping(["group-a"]),
    );
    expect(result).toEqual([
      expect.objectContaining({
        type: "v2-project-group",
        count: 2,
        collapsed: true,
        usageLabel: "3K ~$0.75",
        showDivider: false,
      }),
    ]);
  });
});
