import { describe, expect, it } from "vitest";
import { cacheReuseRatio, formatTokenCount, formatUsdCents, showsMoney, showsTokens } from "./usage-display";

describe("usage display helpers", () => {
  it("formats tokens compactly per locale", () => {
    expect(formatTokenCount(950, "en")).toBe("950");
    expect(formatTokenCount(1_250_000, "en")).toBe("1.3M");
    expect(formatTokenCount(1_250_000, "es")).toMatch(/1,3/);
  });

  it("formats dollars, keeping sub-cent amounts visible", () => {
    expect(formatUsdCents(12345, "en")).toBe("$123.45");
    expect(formatUsdCents(0.04, "en")).toBe("$0.0004");
    expect(formatUsdCents(0, "en")).toBe("$0.00");
  });

  it("maps the display preference to visible columns", () => {
    expect([showsTokens("tokens"), showsMoney("tokens")]).toEqual([true, false]);
    expect([showsTokens("costs"), showsMoney("costs")]).toEqual([false, true]);
    expect([showsTokens("both"), showsMoney("both")]).toEqual([true, true]);
  });

  it("measures cache reuse as reads over all prompt input", () => {
    expect(cacheReuseRatio({ uncachedInputTokens: 100, cacheWriteTokens: 100, cacheReadTokens: 800 })).toBeCloseTo(0.8, 6);
    expect(cacheReuseRatio({ uncachedInputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 })).toBeNull();
  });
});
