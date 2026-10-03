/**
 * Per-thread token and cost rollup shown in the sidebar and thread header.
 *
 * Fork-owned (OM Code). Kept in its own module so upstream merges only touch
 * the single optional `usage` field on {@link OrchestrationThreadShell}.
 *
 * Token figures follow `TurnTokenUsage`: `inputTokens` includes cache reads
 * and writes, `cachedInputTokens` is the cache-read subset, and
 * `reasoningTokens` is a subset of `outputTokens`.
 *
 * @module omThreadUsage
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
