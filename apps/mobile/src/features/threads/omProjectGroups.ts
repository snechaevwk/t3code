/**
 * Project group headers for the mobile thread list (OM Code fork feature).
 *
 * The active block of Thread List v2 is regrouped under one header per
 * project; pinned rows stay above the groups and the pending, snoozed and
 * settled shelves are untouched. Mirrors the web sidebar grouping in
 * apps/web/src/om/sidebarProjectGroups.ts.
 */
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { formatThreadUsageInline, sumThreadUsage } from "@t3tools/client-runtime/om-thread-usage";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { scopedProjectKey } from "../../lib/scopedEntities";

export interface ThreadListV2ProjectGroupListItem {
  readonly type: "v2-project-group";
  readonly key: string;
  readonly groupKey: string;
  readonly title: string;
  readonly project: EnvironmentProject | null;
  readonly count: number;
  /** `608K ~$1.03` precomputed so recycled-list equality sees changes. */
  readonly usageLabel: string | null;
  readonly collapsed: boolean;
  /** Gap and rule above every header that follows other rows. */
  readonly showDivider: boolean;
}

export interface ThreadListV2ProjectGroupInfo {
  readonly key: string;
  readonly title: string;
  readonly project: EnvironmentProject | null;
}

export interface ThreadListV2ProjectGrouping {
  readonly groupOf: (thread: EnvironmentThreadShell) => ThreadListV2ProjectGroupInfo | null;
  /** Group keys in display order; unknown groups follow in first-seen order. */
  readonly order: ReadonlyArray<string>;
  readonly collapsedKeys: ReadonlySet<string>;
}

/**
 * Regroups the active rows. `rows` must be the leading active slice of the
 * list (pinned and active cards, nothing else).
 */
export function groupActiveRowsByProject<
  Row extends {
    readonly item: { readonly thread: EnvironmentThreadShell; readonly pinned: boolean };
  },
>(
  rows: ReadonlyArray<Row>,
  grouping: ThreadListV2ProjectGrouping,
): Array<Row | ThreadListV2ProjectGroupListItem> {
  const pinned: Row[] = [];
  const ungrouped: Row[] = [];
  const groups = new Map<string, { info: ThreadListV2ProjectGroupInfo; rows: Row[] }>();
  for (const row of rows) {
    if (row.item.pinned) {
      pinned.push(row);
      continue;
    }
    const info = grouping.groupOf(row.item.thread);
    if (info === null) {
      ungrouped.push(row);
      continue;
    }
    const group = groups.get(info.key);
    if (group) group.rows.push(row);
    else groups.set(info.key, { info, rows: [row] });
  }
  const rank = new Map(grouping.order.map((key, index) => [key, index]));
  const ordered = [...groups.values()].sort(
    (left, right) =>
      (rank.get(left.info.key) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(right.info.key) ?? Number.MAX_SAFE_INTEGER),
  );
  const result: Array<Row | ThreadListV2ProjectGroupListItem> = [...pinned];
  for (const { info, rows: groupRows } of ordered) {
    const collapsed = grouping.collapsedKeys.has(info.key);
    const usage = sumThreadUsage(groupRows.map((row) => row.item.thread.usage));
    result.push({
      type: "v2-project-group",
      key: `v2-project-group:${info.key}`,
      groupKey: info.key,
      title: info.title,
      project: info.project,
      count: groupRows.length,
      usageLabel: usage ? formatThreadUsageInline(usage) : null,
      collapsed,
      showDivider: result.length > 0,
    });
    if (!collapsed) result.push(...groupRows);
  }
  result.push(...ungrouped);
  return result;
}

/** Builds the grouping from the list's sorted project scopes. */
export function buildThreadListV2ProjectGrouping(input: {
  readonly scopes: ReadonlyArray<{
    readonly key: string;
    readonly title: string;
    readonly representative: EnvironmentProject;
    readonly projectRefs: ReadonlyArray<{
      readonly environmentId: EnvironmentId;
      readonly projectId: ProjectId;
    }>;
  }>;
  readonly collapsedKeys: ReadonlySet<string>;
}): ThreadListV2ProjectGrouping {
  const infoByProjectKey = new Map<string, ThreadListV2ProjectGroupInfo>();
  for (const scope of input.scopes) {
    const info = { key: scope.key, title: scope.title, project: scope.representative };
    for (const ref of scope.projectRefs) {
      infoByProjectKey.set(scopedProjectKey(ref.environmentId, ref.projectId), info);
    }
  }
  return {
    groupOf: (thread) =>
      infoByProjectKey.get(scopedProjectKey(thread.environmentId, thread.projectId)) ?? null,
    order: input.scopes.map((scope) => scope.key),
    collapsedKeys: input.collapsedKeys,
  };
}
