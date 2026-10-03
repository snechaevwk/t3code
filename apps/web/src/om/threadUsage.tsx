/**
 * Token and estimated cost display for threads (OM Code fork feature).
 *
 * The server rolls each thread's per-turn usage into `thread.usage` on the
 * shell, so the sidebar and header render it without loading thread detail.
 */
import type { EnvironmentId, ThreadId, ThreadUsageSummary } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useMemo } from "react";
import {
  formatEstimatedCost,
  threadUsageTotalTokens,
} from "@t3tools/client-runtime/om-thread-usage";
import { formatCount, formatTokens } from "@t3tools/shared/usageFormat";

import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { useThreadShell } from "~/state/entities";

/** One-line `48.2K tok · ~$0.31` for dense rows. */
export function ThreadUsageInline(props: {
  usage: ThreadUsageSummary | null | undefined;
  className?: string;
}) {
  const { usage } = props;
  if (!usage) return null;
  const cost = formatEstimatedCost(usage);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-mono tabular-nums text-muted-foreground",
        props.className,
      )}
    >
      <span>{formatTokens(threadUsageTotalTokens(usage))}</span>
      {cost ? <span className="text-foreground/70">{cost}</span> : null}
    </span>
  );
}

/** Label/value grid for tooltips. */
export function ThreadUsageBreakdown(props: { usage: ThreadUsageSummary }) {
  const { usage } = props;
  const cost = formatEstimatedCost(usage);
  const rows: Array<readonly [string, string]> = [
    ["Input", formatCount(usage.inputTokens)],
    ["  cached", formatCount(usage.cachedInputTokens)],
    ["Output", formatCount(usage.outputTokens)],
    ["  reasoning", formatCount(usage.reasoningTokens)],
    ["Turns", formatCount(usage.turns)],
    ["Est. cost", cost ?? "unpriced"],
  ];
  return (
    <div className="grid gap-1 font-mono text-xs">
      <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <span className="whitespace-pre text-muted-foreground">{label}</span>
            <span className="text-right tabular-nums text-foreground">{value}</span>
          </div>
        ))}
      </div>
      <p className="max-w-56 font-sans text-muted-foreground">
        API-equivalent estimate from model rates. Subscription plans bill separately.
        {usage.unpricedTurns > 0
          ? ` ${formatCount(usage.unpricedTurns)} turn(s) used a model without a known rate.`
          : ""}
      </p>
    </div>
  );
}

/** Thread header chip with a breakdown tooltip. */
export function ThreadUsageHeaderChip(props: { environmentId: EnvironmentId; threadId: ThreadId }) {
  const threadRef = useMemo(
    () => scopeThreadRef(props.environmentId, props.threadId),
    [props.environmentId, props.threadId],
  );
  const usage = useThreadShell(threadRef)?.usage;
  if (!usage) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="status"
            aria-label="Token usage"
            className="hidden shrink-0 cursor-default items-center rounded-sm border border-border px-1.5 py-0.5 text-xs sm:inline-flex"
          />
        }
      >
        <ThreadUsageInline usage={usage} />
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        <ThreadUsageBreakdown usage={usage} />
      </TooltipPopup>
    </Tooltip>
  );
}
