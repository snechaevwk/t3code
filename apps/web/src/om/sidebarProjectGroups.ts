/**
 * Groups the sidebar's Active and Settled threads under project headers
 * (OM Code fork feature). Pure helpers plus a small persisted preference store; the
 * Sidebar applies them without changing how threads are classified.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

export interface ProjectThreadGroup<T> {
  readonly groupKey: string;
  readonly threads: readonly T[];
}

/**
 * Buckets threads by project group, keeping each thread's relative order.
 * Groups follow `groupOrder` (the sidebar's project sort), and groups not in
 * it follow in first-appearance order.
 */
export function groupThreadsByProject<T>(
  threads: readonly T[],
  groupKeyOf: (thread: T) => string,
  groupOrder: readonly string[],
): ProjectThreadGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const thread of threads) {
    const key = groupKeyOf(thread);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(thread);
    else byKey.set(key, [thread]);
  }
  const rank = new Map(groupOrder.map((key, index) => [key, index]));
  return [...byKey.entries()]
    .map(([groupKey, groupThreads], appearance) => ({
      groupKey,
      threads: groupThreads,
      rank: rank.get(groupKey) ?? groupOrder.length + appearance,
    }))
    .toSorted((left, right) => left.rank - right.rank)
    .map(({ groupKey, threads: groupThreads }) => ({ groupKey, threads: groupThreads }));
}

export interface ProjectSection<T> {
  readonly groupKey: string;
  /** Active threads, empty while the section is collapsed. */
  readonly active: readonly T[];
  /** Settled threads, kept apart so the section can tuck them away. */
  readonly settled: readonly T[];
  readonly collapsed: boolean;
}

/**
 * One section per project, every project included even without threads, so
 * the sidebar always lists them. Sections follow `groupOrder`; projects
 * that only show up on threads follow in first-appearance order, active
 * threads first. Collapsing a section hides all of its rows.
 */
export function buildProjectSections<T>(input: {
  readonly active: readonly T[];
  readonly settled: readonly T[];
  readonly groupKeyOf: (thread: T) => string;
  readonly groupOrder: readonly string[];
  readonly isCollapsed: (groupKey: string) => boolean;
}): ProjectSection<T>[] {
  const keys = [...input.groupOrder];
  const known = new Set(keys);
  const bucket = (threads: readonly T[]) => {
    const byKey = new Map<string, T[]>();
    for (const thread of threads) {
      const key = input.groupKeyOf(thread);
      if (!known.has(key)) {
        known.add(key);
        keys.push(key);
      }
      const list = byKey.get(key);
      if (list) list.push(thread);
      else byKey.set(key, [thread]);
    }
    return byKey;
  };
  const activeByKey = bucket(input.active);
  const settledByKey = bucket(input.settled);
  return keys.map((groupKey) => {
    const collapsed = input.isCollapsed(groupKey);
    return {
      groupKey,
      active: collapsed ? [] : (activeByKey.get(groupKey) ?? []),
      settled: settledByKey.get(groupKey) ?? [],
      collapsed,
    };
  });
}

interface SidebarGroupingState {
  groupByProject: boolean;
  collapsedGroupKeys: Record<string, true>;
  setGroupByProject: (enabled: boolean) => void;
  toggleGroupCollapsed: (groupKey: string) => void;
  /** Sections showing their settled threads. Not persisted: settled starts hidden. */
  expandedSettledGroupKeys: Record<string, true>;
  toggleSettledExpanded: (groupKey: string) => void;
}

export const useSidebarGroupingStore = create<SidebarGroupingState>()(
  persist(
    (set) => ({
      groupByProject: true,
      collapsedGroupKeys: {},
      expandedSettledGroupKeys: {},
      setGroupByProject: (enabled) => set({ groupByProject: enabled }),
      toggleGroupCollapsed: (groupKey) =>
        set((state) => {
          const { [groupKey]: wasCollapsed, ...rest } = state.collapsedGroupKeys;
          return { collapsedGroupKeys: wasCollapsed ? rest : { ...rest, [groupKey]: true } };
        }),
      toggleSettledExpanded: (groupKey) =>
        set((state) => {
          const { [groupKey]: wasExpanded, ...rest } = state.expandedSettledGroupKeys;
          return {
            expandedSettledGroupKeys: wasExpanded ? rest : { ...rest, [groupKey]: true },
          };
        }),
    }),
    {
      name: "omcode:sidebar-grouping:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        groupByProject: state.groupByProject,
        collapsedGroupKeys: state.collapsedGroupKeys,
      }),
    },
  ),
);
