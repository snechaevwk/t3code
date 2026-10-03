/**
 * Groups the sidebar's Active threads under project headers (OM Code fork
 * feature). Pure helpers plus a small persisted preference store; the
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

/**
 * Where each group header renders: before the first visible thread of its
 * group, or in the tail when the group has no visible threads (collapsed).
 */
export function placeGroupHeaders<T>(
  groups: readonly ProjectThreadGroup<T>[],
  isVisible: (thread: T) => boolean,
  keyOf: (thread: T) => string,
): { readonly beforeThread: ReadonlyMap<string, string[]>; readonly trailing: string[] } {
  const beforeThread = new Map<string, string[]>();
  let pending: string[] = [];
  for (const group of groups) {
    pending.push(group.groupKey);
    const firstVisible = group.threads.find(isVisible);
    if (firstVisible !== undefined) {
      beforeThread.set(keyOf(firstVisible), pending);
      pending = [];
    }
  }
  return { beforeThread, trailing: pending };
}

interface SidebarGroupingState {
  groupByProject: boolean;
  collapsedGroupKeys: Record<string, true>;
  setGroupByProject: (enabled: boolean) => void;
  toggleGroupCollapsed: (groupKey: string) => void;
}

export const useSidebarGroupingStore = create<SidebarGroupingState>()(
  persist(
    (set) => ({
      groupByProject: true,
      collapsedGroupKeys: {},
      setGroupByProject: (enabled) => set({ groupByProject: enabled }),
      toggleGroupCollapsed: (groupKey) =>
        set((state) => {
          const { [groupKey]: wasCollapsed, ...rest } = state.collapsedGroupKeys;
          return { collapsedGroupKeys: wasCollapsed ? rest : { ...rest, [groupKey]: true } };
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
