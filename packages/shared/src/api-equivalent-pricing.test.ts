import { describe, expect, it } from "vitest";
import {
  API_RATE_CARDS,
  estimateApiEquivalent,
  findApiRateCard,
  normalizeModelForPricing,
} from "./api-equivalent-pricing";

describe("API-equivalent pricing", () => {
  it("documents a source and verification date for every rate card", () => {
    for (const card of API_RATE_CARDS) {
      expect(card.source).toMatch(/^https:\/\//);
      expect(card.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(card.cacheReadPerMTok).toBeLessThan(card.inputPerMTok);
    }
  });

  it("normalises routing prefixes and dated snapshots", () => {
    expect(normalizeModelForPricing("anthropic/claude-sonnet-5-5")).toBe("claude-sonnet-5-5");
    expect(normalizeModelForPricing("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5");
    expect(normalizeModelForPricing("claude-opus-5-5[1m]")).toBe("claude-opus-5-5");
    expect(findApiRateCard("claude", "claude-opus-5-5")?.inputPerMTok).toBe(4);
    expect(findApiRateCard("openrouter", "anthropic/claude-sonnet-5")?.provider).toBe("anthropic");
  });

  it("prices each token category once (cache writes are a subset of input)", () => {
    const estimate = estimateApiEquivalent("anthropic", "claude-sonnet-5-5", {
      inputTokens: 1_000_000, // 600k uncached + 400k cache writes
      cacheWriteTokens: 400_000,
      cacheReadTokens: 2_000_000,
      outputTokens: 100_000,
    });
    // 0.6M × $2 + 0.4M × $2.5 + 2M × $0.2 + 0.1M × $10 = 1.2 + 1 + 0.4 + 1 = $3.60
    expect(estimate.cents).toBeCloseTo(360, 6);
    // Reads at full input price would have been 2M × $2 = $4, they cost $0.40.
    expect(estimate.cacheSavingsCents).toBeCloseTo(360, 6);
    expect(estimate.cacheWritesUnknown).toBe(false);
  });

  it("prices unreported cache writes as plain input and says so", () => {
    const estimate = estimateApiEquivalent("anthropic", "claude-opus-5-5", {
      inputTokens: 500_000,
      cacheWriteTokens: null,
      cacheReadTokens: 0,
      outputTokens: 0,
    });
    expect(estimate.cents).toBeCloseTo(200, 6);
    expect(estimate.cacheWritesUnknown).toBe(true);
  });

  it("reports unknown models as unpriced instead of free", () => {
    const estimate = estimateApiEquivalent("acme", "mystery-model", {
      inputTokens: 10,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 10,
    });
    expect(estimate.cents).toBeNull();
    expect(estimate.rateCard).toBeNull();
  });
});
