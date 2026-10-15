import { describe, expect, it } from "vitest";
import { assessCacheReuse, type CacheRunSample } from "./cache-reuse.js";

let minute = 0;
function run(overrides: Partial<CacheRunSample> = {}): CacheRunSample {
  minute += 3;
  const start = new Date(Date.UTC(2026, 9, 1, 10, minute)).toISOString();
  const end = new Date(Date.UTC(2026, 9, 1, 10, minute + 1)).toISOString();
  return {
    runId: `run-${minute}`,
    startedAt: start,
    finishedAt: end,
    provider: "anthropic",
    models: ["claude-sonnet-5-5"],
    sessionIdBefore: "s1",
    sessionIdAfter: "s1",
    uncachedInputTokens: 1_000,
    cacheWriteTokens: 1_000,
    cacheReadTokens: 18_000,
    outputTokens: 500,
    cacheSavingsCents: 3,
    ...overrides,
  };
}

describe("assessCacheReuse", () => {
  it("needs a few measurable runs before judging", () => {
    const result = assessCacheReuse([run(), run()]);
    expect(result.status).toBe("insufficient");
    expect(result.insufficientReason).toBe("few_runs");
  });

  it("reports high reuse and the API-equivalent saving", () => {
    const result = assessCacheReuse([run(), run(), run(), run()]);
    expect(result.status).toBe("high");
    expect(result.latestRatio).toBeCloseTo(0.9, 6);
    expect(result.savingsCents).toBe(12);
  });

  it("flags a drop and names visible causes on the latest run", () => {
    const result = assessCacheReuse([
      run(),
      run(),
      run(),
      run({ sessionIdBefore: null, sessionIdAfter: "s2", models: ["claude-opus-5-5"], cacheReadTokens: 0, cacheWriteTokens: 19_000 }),
    ]);
    expect(result.status).toBe("dropped");
    expect(result.latestCauses).toEqual(["new_session", "model_changed"]);
    expect(result.runs.at(-1)!.reuseRatio).toBe(0);
  });

  it("notices gaps longer than the default cache lifetime", () => {
    const first = run();
    const late = run({ startedAt: new Date(Date.parse(first.finishedAt!) + 20 * 60_000).toISOString() });
    const result = assessCacheReuse([first, late]);
    expect(result.runs[1]!.causes).toContain("long_gap");
    expect(result.runs[1]!.gapMs).toBe(20 * 60_000);
  });

  it("does not call missing counters a cache loss", () => {
    const silent = { cacheReadTokens: 0, cacheWriteTokens: null, uncachedInputTokens: 20_000, cacheSavingsCents: null };
    const result = assessCacheReuse([run(silent), run(silent), run(silent)]);
    expect(result.status).toBe("insufficient");
    expect(result.insufficientReason).toBe("not_reported");
    expect(result.savingsCents).toBeNull();
  });

  it("ignores runs too small to measure", () => {
    const tiny = { uncachedInputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0 };
    const result = assessCacheReuse([run(tiny), run(tiny), run(tiny), run(tiny)]);
    expect(result.status).toBe("insufficient");
    expect(result.runs[0]!.reuseRatio).toBeNull();
  });
});
