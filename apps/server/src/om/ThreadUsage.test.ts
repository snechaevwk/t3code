import { ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import type { RateTable } from "../usage/usagePricing.ts";
import * as ThreadUsage from "./ThreadUsage.ts";

const layer = it.layer(ThreadUsage.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)));

const record = (overrides: Partial<ThreadUsage.TurnUsageRecord> = {}) => ({
  model: "test-model",
  inputTokens: 1_000,
  cachedInputTokens: 400,
  cacheCreationTokens: 100,
  outputTokens: 200,
  reasoningTokens: 50,
  ...overrides,
});

layer("ThreadUsageService", (it) => {
  it.effect("loads persisted turns once and does not double count a recorded turn", () =>
    Effect.gen(function* () {
      const service = yield* ThreadUsage.ThreadUsageService;
      const sql = yield* SqlClient.SqlClient;
      const threadId = ThreadId.make("thread-usage-load");
      const payload = `{"${ThreadUsage.TURN_USAGE_PAYLOAD_KEY}":{"model":"test-model","inputTokens":1000,"cachedInputTokens":400,"cacheCreationTokens":100,"outputTokens":200,"reasoningTokens":50}}`;

      yield* sql`
        INSERT INTO projection_thread_activities (
          activity_id, thread_id, turn_id, tone, kind, summary, payload_json, sequence, created_at
        )
        VALUES
          ('turn-1', ${threadId}, NULL, 'info', 'context-window.updated', 'usage', ${payload}, 1,
            '2026-03-01T00:00:00.000Z'),
          ('meter', ${threadId}, NULL, 'info', 'context-window.updated', 'meter',
            '{"usedTokens":12}', 2, '2026-03-01T00:00:01.000Z')
      `;
      // Recorded by ingestion before its thread was ever summarized.
      service.recordTurn({ threadId, turnKey: "turn-1", record: record() });
      service.recordTurn({ threadId, turnKey: "turn-2", record: record({ outputTokens: 300 }) });

      const summary = (yield* service.summarize([threadId])).get(threadId);
      assert.deepStrictEqual(summary, {
        turns: 2,
        inputTokens: 2_000,
        cachedInputTokens: 800,
        outputTokens: 500,
        reasoningTokens: 100,
        estimatedCostUsd: null,
        unpricedTurns: 2,
      });
    }),
  );
});

it("prices each turn from uncached, cached, cache-write and output tokens", () => {
  const rates: RateTable = new Map([
    [
      "test-model",
      {
        inputCostPerToken: 1,
        outputCostPerToken: 10,
        cacheReadCostPerToken: 0.1,
        cacheCreationCostPerToken: 2,
        fastMultiplier: 1,
      },
    ],
  ]);
  const summary = ThreadUsage.summarizeTurnUsage([record(), record({ model: "unknown" })], {
    rates,
    overrides: new Map(),
  });
  // 500 uncached + 400 * 0.1 cached + 100 * 2 written + 200 * 10 output.
  assert.strictEqual(summary.estimatedCostUsd, 500 + 40 + 200 + 2_000);
  assert.strictEqual(summary.unpricedTurns, 1);
  assert.strictEqual(summary.turns, 2);
});
