import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { costEvents, heartbeatRuns, type Db } from "@paperclipai/db";
import { assessCacheReuse, estimateApiEquivalent, type CacheReuseAssessment, type CacheRunSample } from "@paperclipai/shared";
import { ordinaryInputTokens } from "./costs.js";

const RUN_LIMIT = 20;

const num = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export type CacheReuseScope = { agentId: string } | { issueId: string };

/**
 * Cache reuse over the latest runs of one agent, or of one conversation/task.
 * Reads only token counters, models, timestamps and session ids — no content.
 */
export function cacheReuseService(db: Db) {
  return {
    assess: async (companyId: string, scope: CacheReuseScope): Promise<CacheReuseAssessment> => {
      const scopeCondition = "agentId" in scope
        ? eq(heartbeatRuns.agentId, scope.agentId)
        : or(eq(heartbeatRuns.issueId, scope.issueId), sql`${heartbeatRuns.contextSnapshot} ->> 'issueId' = ${scope.issueId}`);
      const recentRuns = await db
        .select({
          id: heartbeatRuns.id,
          startedAt: heartbeatRuns.startedAt,
          finishedAt: heartbeatRuns.finishedAt,
          sessionIdBefore: heartbeatRuns.sessionIdBefore,
          sessionIdAfter: heartbeatRuns.sessionIdAfter,
        })
        .from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.companyId, companyId), scopeCondition, isNotNull(heartbeatRuns.costAccountedAt)))
        .orderBy(desc(heartbeatRuns.startedAt))
        .limit(RUN_LIMIT);
      if (recentRuns.length === 0) return assessCacheReuse([]);

      const usage = await db
        .select({
          runId: costEvents.heartbeatRunId,
          provider: costEvents.provider,
          model: costEvents.model,
          inputTokens: sql<number>`coalesce(sum(${ordinaryInputTokens}), 0)::double precision`,
          cacheReadTokens: sql<number>`coalesce(sum(${costEvents.cachedInputTokens}), 0)::double precision`,
          cacheWriteTokens: sql<number | null>`sum(${costEvents.cacheWriteInputTokens})::double precision`,
          outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::double precision`,
        })
        .from(costEvents)
        .where(and(eq(costEvents.companyId, companyId), inArray(costEvents.heartbeatRunId, recentRuns.map((run) => run.id))))
        .groupBy(costEvents.heartbeatRunId, costEvents.provider, costEvents.model);

      const byRun = new Map<string, typeof usage>();
      for (const row of usage) {
        if (!row.runId) continue;
        byRun.set(row.runId, [...(byRun.get(row.runId) ?? []), row]);
      }

      const samples: CacheRunSample[] = [];
      for (const run of [...recentRuns].reverse()) {
        const rows = byRun.get(run.id) ?? [];
        if (rows.length === 0) continue;
        let input = 0;
        let reads = 0;
        let writes: number | null = null;
        let output = 0;
        let savings: number | null = null;
        for (const row of rows) {
          const rowWrites = row.cacheWriteTokens === null ? null : num(row.cacheWriteTokens);
          input += num(row.inputTokens);
          reads += num(row.cacheReadTokens);
          output += num(row.outputTokens);
          if (rowWrites !== null) writes = (writes ?? 0) + rowWrites;
          const estimate = estimateApiEquivalent(row.provider, row.model, {
            inputTokens: num(row.inputTokens),
            cacheReadTokens: num(row.cacheReadTokens),
            cacheWriteTokens: rowWrites,
            outputTokens: num(row.outputTokens),
          });
          if (estimate.cacheSavingsCents !== null) savings = (savings ?? 0) + estimate.cacheSavingsCents;
        }
        samples.push({
          runId: run.id,
          startedAt: run.startedAt ? run.startedAt.toISOString() : null,
          finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
          provider: rows[0]!.provider,
          models: [...new Set(rows.map((row) => row.model))],
          sessionIdBefore: run.sessionIdBefore,
          sessionIdAfter: run.sessionIdAfter,
          uncachedInputTokens: Math.max(input - (writes ?? 0), 0),
          cacheWriteTokens: writes,
          cacheReadTokens: reads,
          outputTokens: output,
          cacheSavingsCents: savings,
        });
      }
      return assessCacheReuse(samples);
    },
  };
}
