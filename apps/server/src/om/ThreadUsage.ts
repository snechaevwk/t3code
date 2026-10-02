/**
 * ThreadUsageService - per-thread token and estimated cost rollups for the
 * sidebar and thread header (OM Code fork feature).
 *
 * Each finished turn's normalized `tokenUsage` is persisted as a thread
 * activity, so totals survive restarts without a schema migration (a fork
 * migration id would block upstream's later migrations). The activity rides
 * the `context-window.updated` kind with no `usedTokens`: every client,
 * including upstream builds, already hides that kind from the timeline and
 * skips rows without `usedTokens` when reading the context meter.
 *
 * Totals are cached in memory per thread. A thread's turns are read from SQL
 * the first time its shell is built, then kept current by ingestion. Entries
 * are keyed by turn, so a turn recorded while its thread is loading is never
 * counted twice. Cost is priced at read time from `UsageService`'s rate table
 * so a table that loads later (or a new price override) applies to old turns.
 *
 * Optional at every call site (`Effect.serviceOption`): suites that build the
 * orchestration layers without it simply get no `usage` field.
 *
 * @module ThreadUsageService
 */
import {
  EventId,
  type OrchestrationThreadActivity,
  type ProviderRuntimeEvent,
  type ThreadUsageSummary,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { UsageService, type CurrentRateTables } from "../usage/UsageService.ts";
import { priceUsage } from "../usage/usagePricing.ts";

export const TURN_USAGE_PAYLOAD_KEY = "omTurnUsage";
const TURN_USAGE_ACTIVITY_KIND = "context-window.updated";

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

/** Reads a persisted record back, rejecting anything malformed. */
export function decodeTurnUsageRecord(payload: unknown): TurnUsageRecord | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raw = (payload as Record<string, unknown>)[TURN_USAGE_PAYLOAD_KEY];
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const model = typeof record.model === "string" ? record.model.trim() : "";
  const inputTokens = nonNegativeInt(record.inputTokens);
  const outputTokens = nonNegativeInt(record.outputTokens);
  if (model.length === 0 || inputTokens === null || outputTokens === null) return null;
  return {
    model,
    inputTokens,
    cachedInputTokens: nonNegativeInt(record.cachedInputTokens) ?? 0,
    cacheCreationTokens: nonNegativeInt(record.cacheCreationTokens) ?? 0,
    outputTokens,
    reasoningTokens: nonNegativeInt(record.reasoningTokens) ?? 0,
  };
}

/**
 * The record for a finished turn, or null when the provider reported no
 * input and output totals for it.
 */
export function turnUsageRecordFromEvent(
  event: ProviderRuntimeEvent,
  model: string,
): TurnUsageRecord | null {
  if (event.type !== "turn.completed" && event.type !== "turn.aborted") return null;
  const usage = event.payload.tokenUsage;
  if (usage?.inputTokens === undefined || usage.outputTokens === undefined) return null;
  if (usage.inputTokens + usage.outputTokens === 0) return null;
  return {
    model,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens ?? 0,
    cacheCreationTokens: usage.cacheCreationTokens ?? 0,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens ?? 0,
  };
}

export function turnUsageActivity(
  event: ProviderRuntimeEvent,
  record: TurnUsageRecord,
): Omit<OrchestrationThreadActivity, "sequence"> {
  return {
    id: EventId.make(`om-turn-usage:${event.eventId}`),
    createdAt: event.createdAt,
    tone: "info",
    kind: TURN_USAGE_ACTIVITY_KIND,
    summary: "Turn usage recorded",
    payload: { [TURN_USAGE_PAYLOAD_KEY]: record },
    turnId: (event.turnId ?? null) as OrchestrationThreadActivity["turnId"],
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
        fast: false,
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

export class ThreadUsageService extends Context.Service<
  ThreadUsageService,
  {
    /** Usage per thread id. Threads without recorded turns are absent. */
    readonly summarize: (
      threadIds: ReadonlyArray<string>,
    ) => Effect.Effect<ReadonlyMap<string, ThreadUsageSummary>>;
    readonly recordTurn: (input: {
      readonly threadId: string;
      readonly turnKey: string;
      readonly record: TurnUsageRecord;
    }) => void;
  }
>()("t3/om/ThreadUsage/ThreadUsageService") {}

const LOAD_CHUNK_SIZE = 500;
const decodePayloadJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));
const EMPTY_TABLES: CurrentRateTables = { rates: new Map(), overrides: new Map() };

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const usageService = yield* Effect.serviceOption(UsageService);

  const turnsByThreadId = new Map<string, Map<string, TurnUsageRecord>>();
  // Turns recorded before their thread was loaded; merged in by key on load.
  const pendingByThreadId = new Map<string, Map<string, TurnUsageRecord>>();

  const loadThreads = (threadIds: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      for (let start = 0; start < threadIds.length; start += LOAD_CHUNK_SIZE) {
        const chunk = threadIds.slice(start, start + LOAD_CHUNK_SIZE);
        const rows = yield* sql<{
          readonly threadId: string;
          readonly activityId: string;
          readonly payload: string;
        }>`
          SELECT thread_id AS "threadId", activity_id AS "activityId", payload_json AS "payload"
          FROM projection_thread_activities
          WHERE ${sql.in("thread_id", chunk)}
            AND kind = ${TURN_USAGE_ACTIVITY_KIND}
            AND json_extract(payload_json, ${`$.${TURN_USAGE_PAYLOAD_KEY}`}) IS NOT NULL
        `;
        const loaded = new Map<string, Map<string, TurnUsageRecord>>(
          chunk.map((threadId) => [threadId, new Map()]),
        );
        for (const row of rows) {
          const payload = decodePayloadJson(row.payload);
          if (Option.isNone(payload)) continue;
          const record = decodeTurnUsageRecord(payload.value);
          if (record !== null) loaded.get(row.threadId)?.set(row.activityId, record);
        }
        for (const [threadId, turns] of loaded) {
          for (const [turnKey, record] of pendingByThreadId.get(threadId) ?? []) {
            turns.set(turnKey, record);
          }
          pendingByThreadId.delete(threadId);
          if (!turnsByThreadId.has(threadId)) turnsByThreadId.set(threadId, turns);
        }
      }
    });

  const summarize = (threadIds: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const missing = threadIds.filter((threadId) => !turnsByThreadId.has(threadId));
      if (missing.length > 0) {
        yield* loadThreads(missing).pipe(
          Effect.catchCause((cause) => Effect.logWarning("om thread usage load failed", { cause })),
        );
      }
      const tables = Option.isSome(usageService)
        ? yield* usageService.value.currentRateTables
        : EMPTY_TABLES;
      const summaries = new Map<string, ThreadUsageSummary>();
      for (const threadId of threadIds) {
        const turns = turnsByThreadId.get(threadId);
        if (turns === undefined || turns.size === 0) continue;
        summaries.set(threadId, summarizeTurnUsage(turns.values(), tables));
      }
      return summaries as ReadonlyMap<string, ThreadUsageSummary>;
    });

  const recordTurn: ThreadUsageService["Service"]["recordTurn"] = ({
    threadId,
    turnKey,
    record,
  }) => {
    const target =
      turnsByThreadId.get(threadId) ??
      pendingByThreadId.get(threadId) ??
      pendingByThreadId.set(threadId, new Map()).get(threadId)!;
    target.set(turnKey, record);
  };

  return ThreadUsageService.of({ summarize, recordTurn });
});

export const layer = Layer.effect(ThreadUsageService, make);
