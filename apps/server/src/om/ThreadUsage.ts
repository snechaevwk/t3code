/**
 * OM Code: per-thread token and cost totals, read from the projected `turnTokenUsage`
 * so no events or tables collide with upstream migrations. Cost is priced at read
 * time, so later rate tables apply to old turns. Without SQL or `UsageService`, no `usage`.
 */
import type {
  OrchestrationV2ThreadShell,
  OrchestrationV2ThreadShellSnapshot,
  ThreadUsageSummary,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";

import { UsageService, type CurrentRateTables } from "../usage/UsageService.ts";
import { priceUsage } from "../usage/usagePricing.ts";

export interface TurnUsageRecord {
  readonly model: string;
  /** Includes cache reads and writes. */
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheCreationTokens: number;
  /** Includes reasoning. */
  readonly outputTokens: number;
  readonly reasoningTokens: number;
}

function nonNegativeInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * A stored `turnTokenUsage` as a record, or null when the provider reported
 * no input and output totals for the turn.
 */
export function turnUsageRecordFromJson(json: string, model: string): TurnUsageRecord | null {
  let usage: unknown;
  try {
    usage = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof usage !== "object" || usage === null) return null;
  const fields = usage as Record<string, unknown>;
  const inputTokens = nonNegativeInt(fields.inputTokens);
  const outputTokens = nonNegativeInt(fields.outputTokens);
  if (inputTokens === null || outputTokens === null || inputTokens + outputTokens === 0) {
    return null;
  }
  return {
    model,
    inputTokens,
    cachedInputTokens: nonNegativeInt(fields.cachedInputTokens) ?? 0,
    cacheCreationTokens: nonNegativeInt(fields.cacheCreationTokens) ?? 0,
    outputTokens,
    reasoningTokens: nonNegativeInt(fields.reasoningTokens) ?? 0,
  };
}

/** Sums a thread's turns and prices each one against the current rates. */
export function summarizeTurnUsage(
  records: Iterable<TurnUsageRecord>,
  tables: CurrentRateTables,
): ThreadUsageSummary {
  let turns = 0;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let costUsd = 0;
  let unpricedTurns = 0;
  for (const record of records) {
    turns += 1;
    inputTokens += record.inputTokens;
    cachedInputTokens += record.cachedInputTokens;
    outputTokens += record.outputTokens;
    reasoningTokens += record.reasoningTokens;
    const priced = priceUsage(
      tables.rates,
      {
        model: record.model,
        totals: {
          uncachedInputTokens: Math.max(
            0,
            record.inputTokens - record.cachedInputTokens - record.cacheCreationTokens,
          ),
          cachedInputTokens: record.cachedInputTokens,
          cacheCreationTokens: record.cacheCreationTokens,
          outputTokens: record.outputTokens,
          reasoningTokens: record.reasoningTokens,
        },
        speed: "standard",
        reportedCostUsd: null,
      },
      tables.overrides,
    );
    if (priced.costSource === "unpriced") {
      unpricedTurns += 1;
    } else {
      costUsd += priced.costUsd;
    }
  }
  return {
    turns,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    estimatedCostUsd: turns > unpricedTurns ? costUsd : null,
    unpricedTurns,
  };
}

const LOAD_CHUNK_SIZE = 500;
const EMPTY_TABLES: CurrentRateTables = { rates: new Map(), overrides: new Map() };

interface TurnUsageRow {
  readonly threadId: string;
  readonly usage: string;
  readonly model: string | null;
}

/**
 * Builds the functions that attach `usage` to shells. Resolved once when the
 * owning service is built; absent services turn them into identities.
 */
export const makeShellUsageEnricher = Effect.gen(function* () {
  const sqlOption = yield* Effect.serviceOption(SqlClient.SqlClient);
  const usageService = yield* Effect.serviceOption(UsageService);

  const readRows = (sql: SqlClient.SqlClient, threadIds: ReadonlyArray<string>) =>
    Effect.forEach(
      Array.from({ length: Math.ceil(threadIds.length / LOAD_CHUNK_SIZE) }, (_, index) =>
        threadIds.slice(index * LOAD_CHUNK_SIZE, (index + 1) * LOAD_CHUNK_SIZE),
      ),
      (chunk) => sql<TurnUsageRow>`
        SELECT
          turns.thread_id AS "threadId",
          json_extract(turns.payload_json, '$.turnTokenUsage') AS "usage",
          json_extract(runs.payload_json, '$.modelSelection.model') AS "model"
        FROM orchestration_v2_projection_provider_turns AS turns
        LEFT JOIN orchestration_v2_projection_run_attempts AS attempts
          ON attempts.attempt_id = turns.run_attempt_id
        LEFT JOIN orchestration_v2_projection_runs AS runs
          ON runs.run_id = attempts.run_id
        WHERE ${sql.in("turns.thread_id", chunk)}
          AND json_extract(turns.payload_json, '$.turnTokenUsage') IS NOT NULL
      `,
    ).pipe(Effect.map((chunks) => chunks.flat()));

  const summarize = Effect.fn("OmThreadUsage.summarize")(
    function* (shells: ReadonlyArray<OrchestrationV2ThreadShell>) {
      const summaries = new Map<string, ThreadUsageSummary>();
      if (Option.isNone(sqlOption) || shells.length === 0) return summaries;
      const rows = yield* readRows(
        sqlOption.value,
        shells.map((shell) => shell.id),
      );
      const fallbackModelByThread = new Map(
        shells.map((shell) => [shell.id as string, shell.modelSelection.model]),
      );
      const recordsByThread = new Map<string, TurnUsageRecord[]>();
      for (const row of rows) {
        const model = row.model ?? fallbackModelByThread.get(row.threadId);
        if (model === undefined) continue;
        const record = turnUsageRecordFromJson(row.usage, model);
        if (record === null) continue;
        const records = recordsByThread.get(row.threadId);
        if (records) records.push(record);
        else recordsByThread.set(row.threadId, [record]);
      }
      if (recordsByThread.size === 0) return summaries;
      const tables = Option.isSome(usageService)
        ? yield* usageService.value.currentRateTables
        : EMPTY_TABLES;
      for (const [threadId, records] of recordsByThread) {
        summaries.set(threadId, summarizeTurnUsage(records, tables));
      }
      return summaries;
    },
    // Usage is decoration: a failed read must never block the shell.
    Effect.catchCause((cause) =>
      Effect.logWarning("om thread usage read failed", { cause }).pipe(
        Effect.as(new Map<string, ThreadUsageSummary>()),
      ),
    ),
  );

  const withUsage = (
    shell: OrchestrationV2ThreadShell,
    summaries: ReadonlyMap<string, ThreadUsageSummary>,
  ): OrchestrationV2ThreadShell => {
    const usage = summaries.get(shell.id);
    return usage === undefined ? shell : { ...shell, usage };
  };

  const enrichShell = (shell: OrchestrationV2ThreadShell | null) =>
    shell === null
      ? Effect.succeed(null)
      : summarize([shell]).pipe(Effect.map((summaries) => withUsage(shell, summaries)));

  const enrichSnapshot = (snapshot: OrchestrationV2ThreadShellSnapshot) =>
    summarize([...snapshot.threads, ...snapshot.archivedThreads]).pipe(
      Effect.map((summaries): OrchestrationV2ThreadShellSnapshot => ({
        ...snapshot,
        threads: snapshot.threads.map((shell) => withUsage(shell, summaries)),
        archivedThreads: snapshot.archivedThreads.map((shell) => withUsage(shell, summaries)),
      })),
    );

  return { enrichShell, enrichSnapshot };
});
