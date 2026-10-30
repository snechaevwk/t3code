/**
 * OM Code: per-thread token and cost rollup, kept apart so upstream merges only
 * touch the optional `usage` field on {@link OrchestrationThreadShell}. Figures follow
 * `TurnTokenUsage`: input includes cache reads and writes, reasoning is part of output.
 */
import * as Schema from "effect/Schema";

import { NonNegativeInt } from "./baseSchemas.ts";

export const ThreadUsageSummary = Schema.Struct({
  /** Turns that reported usage. */
  turns: NonNegativeInt,
  inputTokens: NonNegativeInt,
  cachedInputTokens: NonNegativeInt,
  outputTokens: NonNegativeInt,
  reasoningTokens: NonNegativeInt,
  /**
   * API-equivalent cost estimated from the server's model rate table, or null
   * when no turn could be priced. Subscription plans bill separately.
   */
  estimatedCostUsd: Schema.NullOr(Schema.Number),
  /** Turns whose model had no known rate. Their tokens are still counted. */
  unpricedTurns: NonNegativeInt,
});
export type ThreadUsageSummary = typeof ThreadUsageSummary.Type;
