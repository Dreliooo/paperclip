// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheReuseAssessment, CacheRunAssessment } from "@paperclipai/shared";
import { CacheReuseIndicator } from "./CacheReuseIndicator";

const mocks = vi.hoisted(() => ({ issueCacheReuse: vi.fn(), agentCacheReuse: vi.fn(), getPreferences: vi.fn() }));
vi.mock("../../api/costs", () => ({ costsApi: { issueCacheReuse: mocks.issueCacheReuse, agentCacheReuse: mocks.agentCacheReuse } }));
vi.mock("../../api/userPreferences", () => ({ userPreferencesApi: { get: mocks.getPreferences, update: vi.fn() } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function run(overrides: Partial<CacheRunAssessment> = {}): CacheRunAssessment {
  return {
    runId: "run-1", startedAt: "2026-10-01T10:00:00.000Z", finishedAt: "2026-10-01T10:01:00.000Z",
    provider: "anthropic", models: ["claude-sonnet-5-5"], sessionIdBefore: "s", sessionIdAfter: "s",
    uncachedInputTokens: 1_000, cacheWriteTokens: 1_000, cacheReadTokens: 18_000, outputTokens: 10,
    cacheSavingsCents: 3, reuseRatio: 0.9, gapMs: null, causes: [], ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

async function render(assessment: CacheReuseAssessment) {
  mocks.issueCacheReuse.mockResolvedValue(assessment);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={client}><CacheReuseIndicator scope="issue" issueId="issue-1" /></QueryClientProvider>);
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe("CacheReuseIndicator", () => {
  beforeEach(() => {
    mocks.getPreferences.mockResolvedValue({ locale: null, usageDisplay: "both", updatedAt: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("shows the reuse level for a conversation", async () => {
    await render({ status: "high", insufficientReason: null, latestRatio: 0.9, baselineRatio: 0.88, latestCauses: [], savingsCents: 9, runs: [run(), run(), run()] });
    const badge = container.querySelector('[data-testid="cache-reuse-indicator"]');
    expect(badge?.getAttribute("data-cache-status")).toBe("high");
    expect(badge?.textContent).toContain("High reuse");
    expect(badge?.textContent).toContain("90%");
    expect(mocks.issueCacheReuse).toHaveBeenCalledWith("issue-1");
  });

  it("says when there is not enough data instead of showing a percentage", async () => {
    await render({ status: "insufficient", insufficientReason: "not_reported", latestRatio: null, baselineRatio: null, latestCauses: [], savingsCents: null, runs: [run({ reuseRatio: null })] });
    const badge = container.querySelector('[data-testid="cache-reuse-indicator"]');
    expect(badge?.textContent).toBe("Not enough data");
  });

  it("renders nothing without runs", async () => {
    await render({ status: "insufficient", insufficientReason: "few_runs", latestRatio: null, baselineRatio: null, latestCauses: [], savingsCents: null, runs: [] });
    expect(container.querySelector('[data-testid="cache-reuse-indicator"]')).toBeNull();
  });
});
