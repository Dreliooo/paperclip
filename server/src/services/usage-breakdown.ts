import { and, eq, gte, lte, ne, sql, type SQL } from "drizzle-orm";
import { agents, authUsers, companyMemberships, costEvents, heartbeatRuns, type Db } from "@paperclipai/db";
import {
  API_RATE_CARDS,
  rollupUsageRows,
  type UsageAggregateRow,
  type UsageBreakdownReport,
  type UsageGroupBy,
} from "@paperclipai/shared";
import { withAccountingReadSnapshot } from "./accounting-transaction.js";
import { resolveCostDateRange, type CostDateRange } from "./cost-date-range.js";
import { ordinaryInputTokens } from "./costs.js";

const SUBSCRIPTION_BILLING_TYPES = ["subscription_included", "subscription_overage"];

const num = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Who a cost event is attributed to, as recorded at run time:
 *  - decisions / fast responses carry their own responsible user;
 *  - agent runs use heartbeat_runs.responsible_user_id, except when Paperclip
 *    had to fall back to the company's default responsible user
 *    (executionIdentityCause = company_default): nobody asked for that work,
 *    so it is "automatic" rather than charged to the default person.
 * Only active or former company members count as people; the synthetic
 * local-board principal never does.
 */
const responsibleUserExpr = sql<string | null>`case
  when ${costEvents.usageKind} in ('decision', 'fast_response') then ${costEvents.responsibleUserId}
  when ${heartbeatRuns.contextSnapshot} ->> 'executionIdentityCause' = 'company_default' then null
  else ${heartbeatRuns.responsibleUserId} end`;

const automaticExpr = sql<boolean>`(
  ${costEvents.usageKind} = 'agent' and (
    ${heartbeatRuns.contextSnapshot} ->> 'executionIdentityCause' = 'company_default'
    or (${heartbeatRuns.responsibleUserId} is null and ${heartbeatRuns.invocationSource} in ('timer', 'automation'))
  ))`;

export interface UsageBreakdownQuery {
  groupBy: UsageGroupBy;
  range?: CostDateRange;
  provider?: string | null;
}

export function usageBreakdownService(db: Db) {
  return {
    report: (companyId: string, query: UsageBreakdownQuery): Promise<UsageBreakdownReport> =>
      withAccountingReadSnapshot(db, companyId, async (tx) => {
        const bounds = resolveCostDateRange(query.range);
        const conditions: SQL[] = [eq(costEvents.companyId, companyId)];
        if (bounds.from) conditions.push(gte(costEvents.occurredAt, bounds.from));
        if (bounds.to) conditions.push(lte(costEvents.occurredAt, bounds.to));
        const scoped = [...conditions];
        if (query.provider) conditions.push(eq(costEvents.provider, query.provider));

        const metrics = {
          provider: costEvents.provider,
          model: costEvents.model,
          eventCount: sql<number>`count(*)::int`,
          inputTokens: sql<number>`coalesce(sum(${ordinaryInputTokens}), 0)::double precision`,
          cacheReadTokens: sql<number>`coalesce(sum(${costEvents.cachedInputTokens}), 0)::double precision`,
          cacheWriteTokens: sql<number>`coalesce(sum(${costEvents.cacheWriteInputTokens}), 0)::double precision`,
          inputTokensWithCacheWrites: sql<number>`coalesce(sum(${ordinaryInputTokens}) filter (where ${costEvents.cacheWriteInputTokens} is not null), 0)::double precision`,
          outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::double precision`,
          reportedSpendCents: sql<number>`coalesce(sum(${costEvents.costCents}) filter (where ${costEvents.costStatus} = 'reported'), 0)::double precision`,
          estimatedSpendCents: sql<number>`coalesce(sum(${costEvents.costCents}) filter (where ${costEvents.costStatus} = 'estimated'), 0)::double precision`,
          unpricedEventCount: sql<number>`count(*) filter (where ${costEvents.costStatus} = 'unpriced' and ${costEvents.billingType} not in ('subscription_included'))::int`,
          subscriptionEventCount: sql<number>`count(*) filter (where ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}))::int`,
        };

        const aggregates: UsageAggregateRow[] = [];
        const base = (row: Record<string, unknown>) => ({
          provider: String(row.provider),
          model: String(row.model),
          eventCount: num(row.eventCount),
          inputTokens: num(row.inputTokens),
          cacheReadTokens: num(row.cacheReadTokens),
          cacheWriteTokens: num(row.cacheWriteTokens),
          inputTokensWithCacheWrites: num(row.inputTokensWithCacheWrites),
          outputTokens: num(row.outputTokens),
          reportedSpendCents: num(row.reportedSpendCents),
          estimatedSpendCents: num(row.estimatedSpendCents),
          unpricedEventCount: num(row.unpricedEventCount),
          subscriptionEventCount: num(row.subscriptionEventCount),
        });

        if (query.groupBy === "model") {
          const rows = await tx.select(metrics).from(costEvents).where(and(...conditions))
            .groupBy(costEvents.provider, costEvents.model);
          for (const row of rows) {
            aggregates.push({ groupKind: "model", groupId: `${row.provider}:${row.model}`, label: row.model, ...base(row) });
          }
        } else if (query.groupBy === "agent") {
          const rows = await tx.select({ ...metrics, agentId: costEvents.agentId, agentName: agents.name })
            .from(costEvents)
            .leftJoin(agents, and(eq(agents.id, costEvents.agentId), eq(agents.companyId, costEvents.companyId)))
            .where(and(...conditions))
            .groupBy(costEvents.agentId, agents.name, costEvents.provider, costEvents.model);
          for (const row of rows) {
            aggregates.push(row.agentId
              ? { groupKind: "agent", groupId: row.agentId, label: row.agentName ?? null, ...base(row) }
              // Decisions and fast responses are Paperclip's own model calls.
              : { groupKind: "system", groupId: null, label: null, ...base(row) });
          }
        } else {
          const rows = await tx.select({
            ...metrics,
            userId: companyMemberships.principalId,
            userName: authUsers.name,
            automatic: sql<boolean>`bool_or(${automaticExpr})`,
          })
            .from(costEvents)
            .leftJoin(heartbeatRuns, and(
              eq(heartbeatRuns.id, costEvents.heartbeatRunId),
              eq(heartbeatRuns.companyId, costEvents.companyId),
            ))
            .leftJoin(companyMemberships, and(
              eq(companyMemberships.companyId, companyId),
              eq(companyMemberships.principalType, "user"),
              ne(companyMemberships.principalId, "local-board"),
              eq(companyMemberships.principalId, responsibleUserExpr),
            ))
            .leftJoin(authUsers, eq(authUsers.id, companyMemberships.principalId))
            .where(and(...conditions))
            .groupBy(
              companyMemberships.principalId,
              authUsers.name,
              sql`case when ${companyMemberships.principalId} is null then ${automaticExpr} else false end`,
              costEvents.provider,
              costEvents.model,
            );
          for (const row of rows) {
            if (row.userId) {
              aggregates.push({ groupKind: "person", groupId: row.userId, label: row.userName ?? null, ...base(row) });
            } else {
              aggregates.push({ groupKind: row.automatic ? "automatic" : "unattributed", groupId: null, label: null, ...base(row) });
            }
          }
        }

        const providerRows = await tx.selectDistinct({ provider: costEvents.provider }).from(costEvents).where(and(...scoped));
        const { totals, rows } = rollupUsageRows(aggregates);
        const usedModels = new Set(aggregates.map((row) => row.model));
        return {
          groupBy: query.groupBy,
          from: bounds.from ? bounds.from.toISOString() : null,
          to: bounds.to ? bounds.to.toISOString() : null,
          provider: query.provider ?? null,
          providers: providerRows.map((row) => row.provider).sort(),
          totals,
          rows,
          rateCards: API_RATE_CARDS
            .filter((card) => [...usedModels].some((model) => model.toLowerCase().includes(card.model)))
            .map(({ provider, model, source, verifiedAt, notes }) => ({ provider, model, source, verifiedAt, ...(notes ? { notes } : {}) })),
        };
      }),
  };
}
