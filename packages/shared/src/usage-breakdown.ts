import { estimateApiEquivalent } from "./api-equivalent-pricing.js";

/**
 * Usage breakdown: token consumption, money actually reported by providers,
 * and API-equivalent cost, grouped by model, agent or person.
 *
 * Three different quantities, never mixed:
 *  - tokens: what was consumed, regardless of how it was paid;
 *  - reportedSpendCents: money the provider reported as charged (the ledger);
 *  - apiEquivalent: what the tokens would cost at published API list prices.
 *    It is an estimate for comparison, not a charge and not subscription use.
 */

export type UsageGroupBy = "model" | "agent" | "user";

/**
 * How a usage row is attributed:
 *  - person: the responsible user recorded on the run (who woke or requested
 *    the work, or the task's responsible person) / of a decision;
 *  - automatic: work with no requesting person (Paperclip fell back to the
 *    company default responsible user, or a scheduled run without one);
 *  - unattributed: no reliable attribution was recorded;
 *  - agent / system / model: the non-person groupings.
 */
export type UsageGroupKind = "person" | "automatic" | "unattributed" | "agent" | "system" | "model";

/** One SQL aggregate row: one group × provider × model. */
export interface UsageAggregateRow {
  groupKind: UsageGroupKind;
  /** userId, agentId or "provider:model"; null for automatic/unattributed/system. */
  groupId: string | null;
  label: string | null;
  provider: string;
  model: string;
  eventCount: number;
  /** Uncached input + cache writes (excludes cache reads). */
  inputTokens: number;
  cacheReadTokens: number;
  /** Cache writes summed over rows that reported them. */
  cacheWriteTokens: number;
  /** Input tokens of the rows that reported cache writes (coverage). */
  inputTokensWithCacheWrites: number;
  outputTokens: number;
  reportedSpendCents: number;
  estimatedSpendCents: number;
  unpricedEventCount: number;
  subscriptionEventCount: number;
}

export type CacheWriteCoverage = "all" | "partial" | "none";

export interface UsageTokenBreakdown {
  /** Input processed without the cache (neither read nor written). */
  uncachedInputTokens: number;
  /** Input written to the cache (known part only; see cacheWriteCoverage). */
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  /** input + cache reads + output; each token counted once. */
  totalTokens: number;
  cacheWriteCoverage: CacheWriteCoverage;
}

export interface UsageApiEquivalent {
  /** Sum over priced models; null when nothing could be priced. */
  cents: number | null;
  /** Tokens of models without a rate card (priced as unknown, not zero). */
  unpricedTokens: number;
  unpricedModels: string[];
  complete: boolean;
  /** Estimated saving from cache reads versus uncached input. */
  cacheSavingsCents: number | null;
  /** Some cache writes were not reported and were priced as plain input. */
  cacheWritesEstimated: boolean;
}

export interface UsageModelSlice {
  provider: string;
  model: string;
  tokens: UsageTokenBreakdown;
  apiEquivalentCents: number | null;
}

export interface UsageBreakdownRow {
  groupKind: UsageGroupKind;
  groupId: string | null;
  label: string | null;
  eventCount: number;
  tokens: UsageTokenBreakdown;
  reportedSpendCents: number;
  estimatedSpendCents: number;
  unpricedEventCount: number;
  subscriptionEventCount: number;
  apiEquivalent: UsageApiEquivalent;
  models: UsageModelSlice[];
}

export interface UsageBreakdownReport {
  groupBy: UsageGroupBy;
  from: string | null;
  to: string | null;
  provider: string | null;
  providers: string[];
  totals: Omit<UsageBreakdownRow, "groupKind" | "groupId" | "label">;
  rows: UsageBreakdownRow[];
  /** Rate cards used, so the UI can show source and date. */
  rateCards: Array<{ provider: string; model: string; source: string; verifiedAt: string; notes?: string[] }>;
}

interface Accumulator {
  eventCount: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputTokensWithCacheWrites: number;
  outputTokens: number;
  reportedSpendCents: number;
  estimatedSpendCents: number;
  unpricedEventCount: number;
  subscriptionEventCount: number;
  apiCents: number;
  pricedAny: boolean;
  unpricedTokens: number;
  unpricedModels: Set<string>;
  savingsCents: number;
  cacheWritesEstimated: boolean;
  models: Map<string, { provider: string; model: string; acc: Accumulator }>;
}

function emptyAccumulator(): Accumulator {
  return {
    eventCount: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    inputTokensWithCacheWrites: 0,
    outputTokens: 0,
    reportedSpendCents: 0,
    estimatedSpendCents: 0,
    unpricedEventCount: 0,
    subscriptionEventCount: 0,
    apiCents: 0,
    pricedAny: false,
    unpricedTokens: 0,
    unpricedModels: new Set(),
    savingsCents: 0,
    cacheWritesEstimated: false,
    models: new Map(),
  };
}

function add(acc: Accumulator, row: UsageAggregateRow) {
  acc.eventCount += row.eventCount;
  acc.inputTokens += row.inputTokens;
  acc.cacheReadTokens += row.cacheReadTokens;
  acc.cacheWriteTokens += row.cacheWriteTokens;
  acc.inputTokensWithCacheWrites += row.inputTokensWithCacheWrites;
  acc.outputTokens += row.outputTokens;
  acc.reportedSpendCents += row.reportedSpendCents;
  acc.estimatedSpendCents += row.estimatedSpendCents;
  acc.unpricedEventCount += row.unpricedEventCount;
  acc.subscriptionEventCount += row.subscriptionEventCount;

  const tokens = row.inputTokens + row.cacheReadTokens + row.outputTokens;
  if (tokens === 0) return;
  // Rows that did not report cache writes are priced as plain input.
  const writesKnown = row.inputTokensWithCacheWrites >= row.inputTokens;
  const estimate = estimateApiEquivalent(row.provider, row.model, {
    inputTokens: row.inputTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    outputTokens: row.outputTokens,
  });
  if (estimate.cents === null) {
    acc.unpricedTokens += tokens;
    acc.unpricedModels.add(`${row.provider}/${row.model}`);
    return;
  }
  acc.pricedAny = true;
  acc.apiCents += estimate.cents;
  acc.savingsCents += estimate.cacheSavingsCents ?? 0;
  if (!writesKnown && row.inputTokens > 0) acc.cacheWritesEstimated = true;
}

function coverage(acc: Accumulator): CacheWriteCoverage {
  if (acc.inputTokens === 0 || acc.inputTokensWithCacheWrites >= acc.inputTokens) return "all";
  return acc.inputTokensWithCacheWrites > 0 ? "partial" : "none";
}

function tokensOf(acc: Accumulator): UsageTokenBreakdown {
  return {
    uncachedInputTokens: Math.max(acc.inputTokens - acc.cacheWriteTokens, 0),
    cacheWriteTokens: acc.cacheWriteTokens,
    cacheReadTokens: acc.cacheReadTokens,
    outputTokens: acc.outputTokens,
    totalTokens: acc.inputTokens + acc.cacheReadTokens + acc.outputTokens,
    cacheWriteCoverage: coverage(acc),
  };
}

function apiOf(acc: Accumulator): UsageApiEquivalent {
  return {
    cents: acc.pricedAny ? acc.apiCents : null,
    unpricedTokens: acc.unpricedTokens,
    unpricedModels: [...acc.unpricedModels].sort(),
    complete: acc.unpricedTokens === 0,
    cacheSavingsCents: acc.pricedAny ? acc.savingsCents : null,
    cacheWritesEstimated: acc.cacheWritesEstimated,
  };
}

function finish(acc: Accumulator) {
  return {
    eventCount: acc.eventCount,
    tokens: tokensOf(acc),
    reportedSpendCents: acc.reportedSpendCents,
    estimatedSpendCents: acc.estimatedSpendCents,
    unpricedEventCount: acc.unpricedEventCount,
    subscriptionEventCount: acc.subscriptionEventCount,
    apiEquivalent: apiOf(acc),
    models: [...acc.models.values()]
      .map(({ provider, model, acc: modelAcc }) => ({
        provider,
        model,
        tokens: tokensOf(modelAcc),
        apiEquivalentCents: modelAcc.pricedAny ? modelAcc.apiCents : null,
      }))
      .sort((a, b) => b.tokens.totalTokens - a.tokens.totalTokens),
  };
}

const KIND_ORDER: Record<UsageGroupKind, number> = {
  person: 0,
  agent: 0,
  model: 0,
  system: 1,
  automatic: 2,
  unattributed: 3,
};

/**
 * Roll per-model aggregate rows up into groups. Each source row belongs to
 * exactly one group, so the group rows add up to the totals with no
 * duplication.
 */
export function rollupUsageRows(rows: readonly UsageAggregateRow[]) {
  const groups = new Map<string, { kind: UsageGroupKind; id: string | null; label: string | null; acc: Accumulator }>();
  const total = emptyAccumulator();
  for (const row of rows) {
    const key = `${row.groupKind}:${row.groupId ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      group = { kind: row.groupKind, id: row.groupId, label: row.label, acc: emptyAccumulator() };
      groups.set(key, group);
    }
    if (!group.label && row.label) group.label = row.label;
    add(group.acc, row);
    add(total, row);
    for (const target of [group.acc, total]) {
      const modelKey = `${row.provider}\u0000${row.model}`;
      let slice = target.models.get(modelKey);
      if (!slice) {
        slice = { provider: row.provider, model: row.model, acc: emptyAccumulator() };
        target.models.set(modelKey, slice);
      }
      add(slice.acc, row);
    }
  }
  const out: UsageBreakdownRow[] = [...groups.values()].map((group) => ({
    groupKind: group.kind,
    groupId: group.id,
    label: group.label,
    ...finish(group.acc),
  }));
  out.sort(
    (a, b) =>
      KIND_ORDER[a.groupKind] - KIND_ORDER[b.groupKind] ||
      b.tokens.totalTokens - a.tokens.totalTokens ||
      (a.label ?? "").localeCompare(b.label ?? ""),
  );
  return { totals: finish(total), rows: out };
}
