import { describe, expect, it } from "vitest";
import { rollupUsageRows, type UsageAggregateRow } from "./usage-breakdown";

function row(overrides: Partial<UsageAggregateRow>): UsageAggregateRow {
  return {
    groupKind: "person",
    groupId: "user-1",
    label: "Ada",
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    eventCount: 1,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    inputTokensWithCacheWrites: 0,
    outputTokens: 0,
    reportedSpendCents: 0,
    estimatedSpendCents: 0,
    unpricedEventCount: 0,
    subscriptionEventCount: 0,
    ...overrides,
  };
}

describe("rollupUsageRows", () => {
  it("adds groups up to the totals without double counting", () => {
    const report = rollupUsageRows([
      row({ inputTokens: 1_000_000, cacheWriteTokens: 400_000, inputTokensWithCacheWrites: 1_000_000, cacheReadTokens: 2_000_000, outputTokens: 100_000, subscriptionEventCount: 1 }),
      row({ model: "claude-opus-5-5", inputTokens: 500_000, inputTokensWithCacheWrites: 500_000, outputTokens: 50_000, reportedSpendCents: 120 }),
      row({ groupKind: "automatic", groupId: null, label: null, inputTokens: 10, outputTokens: 5 }),
    ]);
    expect(report.rows.map((r) => r.groupKind)).toEqual(["person", "automatic"]);
    const person = report.rows[0]!;
    expect(person.tokens).toEqual({
      uncachedInputTokens: 1_100_000,
      cacheWriteTokens: 400_000,
      cacheReadTokens: 2_000_000,
      outputTokens: 150_000,
      totalTokens: 3_650_000,
      cacheWriteCoverage: "all",
    });
    // Sonnet: $3.60 (see pricing test); Opus: 0.5M × $4 + 0.05M × $20 = $3.00.
    expect(person.apiEquivalent.cents).toBeCloseTo(660, 6);
    expect(person.apiEquivalent.complete).toBe(true);
    expect(person.reportedSpendCents).toBe(120);
    expect(person.models.map((m) => m.model)).toEqual(["claude-sonnet-5-5", "claude-opus-5-5"]);
    expect(report.totals.tokens.totalTokens).toBe(3_650_015);
    expect(report.totals.eventCount).toBe(3);
  });

  it("marks unknown models as unpriced, not free", () => {
    const report = rollupUsageRows([
      row({ provider: "acme", model: "mystery", inputTokens: 100, outputTokens: 50 }),
    ]);
    expect(report.rows[0]!.apiEquivalent).toMatchObject({
      cents: null,
      unpricedTokens: 150,
      unpricedModels: ["acme/mystery"],
      complete: false,
    });
  });

  it("flags cache writes that were not reported", () => {
    const report = rollupUsageRows([
      row({ inputTokens: 1_000, inputTokensWithCacheWrites: 0, outputTokens: 10 }),
    ]);
    expect(report.rows[0]!.tokens.cacheWriteCoverage).toBe("none");
    expect(report.rows[0]!.apiEquivalent.cacheWritesEstimated).toBe(true);
  });
});
