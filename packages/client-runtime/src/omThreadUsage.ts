/**
 * Thread token and estimated cost helpers shared by web and mobile (OM Code
 * fork feature). The server rolls per-turn usage into `thread.usage` on the
 * shell; these only format it.
 */
import type { ThreadUsageSummary } from "@t3tools/contracts";
import { formatTokens, formatUsd } from "@t3tools/shared/usageFormat";

export function threadUsageTotalTokens(usage: ThreadUsageSummary): number {
  return usage.inputTokens + usage.outputTokens;
}

/** `~$0.42`, or null when nothing could be priced. Always an estimate. */
export function formatEstimatedCost(usage: ThreadUsageSummary): string | null {
  if (usage.estimatedCostUsd === null) return null;
  return `~${formatUsd(usage.estimatedCostUsd)}${usage.unpricedTurns > 0 ? "+" : ""}`;
}

/** `608K ~$1.03` for dense rows and headers. */
export function formatThreadUsageInline(usage: ThreadUsageSummary): string {
  const cost = formatEstimatedCost(usage);
  const tokens = formatTokens(threadUsageTotalTokens(usage));
  return cost ? `${tokens} ${cost}` : tokens;
}
