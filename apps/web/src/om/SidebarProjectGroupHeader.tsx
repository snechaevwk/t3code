import type { ThreadUsageSummary } from "@t3tools/contracts";
import { ChevronRightIcon, ListIcon, ListTreeIcon } from "lucide-react";
import { memo } from "react";

import { ProjectFavicon, type ProjectFaviconProject } from "~/components/ProjectFavicon";
import { SidebarHeaderIconButton } from "~/components/sidebar/SidebarThreadHeader";
import { cn } from "~/lib/utils";

import { useSidebarGroupingStore } from "./sidebarProjectGroups";
import { ThreadUsageInline } from "./threadUsage";

/** Collapsible project header above a run of Active threads. */
export const SidebarProjectGroupHeader = memo(function SidebarProjectGroupHeader(props: {
  groupKey: string;
  label: string;
  project: ProjectFaviconProject | null;
  threadCount: number;
  usage: ThreadUsageSummary | null;
  collapsed: boolean;
  /** Opens with a gap and a rule when other rows sit above it. */
  separated: boolean;
  onToggle: (groupKey: string) => void;
}) {
  const { groupKey, onToggle } = props;
  return (
    // The gap and rule make each project's rows read as their own block.
    <li
      className={cn("list-none", props.separated && "mt-4 border-t border-sidebar-border pt-2")}
      data-om-project-group={groupKey}
    >
      <button
        type="button"
        aria-expanded={!props.collapsed}
        onClick={() => onToggle(groupKey)}
        className="flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-sm px-1.5 text-left text-xs text-sidebar-foreground outline-hidden hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRightIcon
          aria-hidden
          className={cn("size-3 shrink-0 transition-transform", !props.collapsed && "rotate-90")}
        />
        {props.project ? (
          <ProjectFavicon project={props.project} className="size-3.5 shrink-0" />
        ) : null}
        <span className="min-w-0 flex-1 truncate font-semibold uppercase tracking-wide">
          {props.label}
        </span>
        <ThreadUsageInline usage={props.usage} className="text-2xs" />
        <span className="shrink-0 font-mono tabular-nums text-sidebar-muted-foreground">
          {props.threadCount}
        </span>
      </button>
    </li>
  );
});

/** Header button that turns project grouping of Active threads on and off. */
export function SidebarGroupingToggle() {
  const groupByProject = useSidebarGroupingStore((state) => state.groupByProject);
  const setGroupByProject = useSidebarGroupingStore((state) => state.setGroupByProject);
  const label = groupByProject ? "Ungroup threads" : "Group threads by project";
  return (
    <SidebarHeaderIconButton
      label={label}
      aria-pressed={groupByProject}
      onClick={() => setGroupByProject(!groupByProject)}
    >
      {groupByProject ? <ListTreeIcon /> : <ListIcon />}
    </SidebarHeaderIconButton>
  );
}
