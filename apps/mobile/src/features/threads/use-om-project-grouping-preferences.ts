import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useMemo, useRef } from "react";

import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";

const EMPTY_KEYS: readonly string[] = [];

/**
 * OM Code: persisted project grouping for the Home list and iPad sidebar.
 * Collapsed groups reuse the `collapsedProjectGroups` preference left over
 * from the v1 sidebar.
 */
export function useOmProjectGroupingPreferences() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const loaded = AsyncResult.isSuccess(preferencesResult);
  const groupByProject = !loaded || preferencesResult.value.omThreadListGroupByProject !== false;
  const collapsedList =
    (loaded ? preferencesResult.value.collapsedProjectGroups : undefined) ?? EMPTY_KEYS;
  const collapsedKeys = useMemo(() => new Set(collapsedList), [collapsedList]);
  const groupByProjectRef = useRef(groupByProject);
  const collapsedRef = useRef(collapsedList);
  groupByProjectRef.current = groupByProject;
  collapsedRef.current = collapsedList;

  const toggleGroupByProject = useCallback(() => {
    if (!loaded) return;
    const next = !groupByProjectRef.current;
    groupByProjectRef.current = next;
    savePreferences({ omThreadListGroupByProject: next });
  }, [loaded, savePreferences]);
  const toggleGroupCollapsed = useCallback(
    (groupKey: string) => {
      if (!loaded) return;
      const current = collapsedRef.current;
      const next = current.includes(groupKey)
        ? current.filter((key) => key !== groupKey)
        : [...current, groupKey];
      collapsedRef.current = next;
      savePreferences({ collapsedProjectGroups: next });
    },
    [loaded, savePreferences],
  );

  return { groupByProject, collapsedKeys, toggleGroupByProject, toggleGroupCollapsed } as const;
}
