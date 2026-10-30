import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useCallback, useMemo } from "react";

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

  const toggleGroupByProject = useCallback(() => {
    if (!loaded) return;
    savePreferences({ omThreadListGroupByProject: !groupByProject });
  }, [groupByProject, loaded, savePreferences]);
  const toggleGroupCollapsed = useCallback(
    (groupKey: string) => {
      if (!loaded) return;
      savePreferences({
        collapsedProjectGroups: collapsedList.includes(groupKey)
          ? collapsedList.filter((key) => key !== groupKey)
          : [...collapsedList, groupKey],
      });
    },
    [collapsedList, loaded, savePreferences],
  );

  return { groupByProject, collapsedKeys, toggleGroupByProject, toggleGroupCollapsed } as const;
}
