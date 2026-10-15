// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageBreakdownReport, UsageBreakdownRow } from "@paperclipai/shared";
import { UsageBreakdownPanel } from "./UsageBreakdownPanel";

const mocks = vi.hoisted(() => ({
  usageBreakdown: vi.fn(),
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));

vi.mock("../../api/costs", () => ({ costsApi: { usageBreakdown: mocks.usageBreakdown } }));
vi.mock("../../api/userPreferences", () => ({
  userPreferencesApi: { get: mocks.getPreferences, update: mocks.updatePreferences },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tokens = {
  uncachedInputTokens: 1_000,
  cacheWriteTokens: 0,
  cacheReadTokens: 9_000,
  outputTokens: 500,
  totalTokens: 10_500,
  cacheWriteCoverage: "none" as const,
};

function row(overrides: Partial<UsageBreakdownRow>): UsageBreakdownRow {
  return {
    groupKind: "person",
    groupId: "user-1",
    label: "Ada Example",
    eventCount: 2,
    tokens,
    reportedSpendCents: 0,
    estimatedSpendCents: 0,
    unpricedEventCount: 0,
    subscriptionEventCount: 2,
    apiEquivalent: { cents: 123, unpricedTokens: 0, unpricedModels: [], complete: true, cacheSavingsCents: 50, cacheWritesEstimated: false },
    models: [{ provider: "anthropic", model: "claude-sonnet-5-5", tokens, apiEquivalentCents: 123 }],
    ...overrides,
  };
}

const report: UsageBreakdownReport = {
  groupBy: "user",
  from: null,
  to: null,
  provider: null,
  providers: ["anthropic", "acme"],
  totals: { ...row({}), eventCount: 4 },
  rows: [
    row({}),
    row({ groupKind: "automatic", groupId: null, label: null }),
    row({
      groupKind: "unattributed",
      groupId: null,
      label: null,
      apiEquivalent: { cents: null, unpricedTokens: 10_500, unpricedModels: ["acme/mystery"], complete: false, cacheSavingsCents: null, cacheWritesEstimated: false },
    }),
  ],
  rateCards: [{ provider: "anthropic", model: "claude-sonnet-5-5", source: "https://platform.claude.com/docs/en/about-claude/pricing", verifiedAt: "2026-10-06" }],
};

let container: HTMLDivElement;
let root: Root;

async function render(usageDisplay: "tokens" | "costs" | "both") {
  mocks.getPreferences.mockResolvedValue({ locale: null, usageDisplay, updatedAt: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={client}><UsageBreakdownPanel companyId="company-1" /></QueryClientProvider>);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("UsageBreakdownPanel", () => {
  beforeEach(() => {
    mocks.usageBreakdown.mockResolvedValue(report);
    mocks.updatePreferences.mockImplementation(async (patch: Record<string, unknown>) => ({ locale: null, usageDisplay: null, updatedAt: null, ...patch }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("hides money columns for people who only want tokens", async () => {
    await render("tokens");
    const headers = Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent);
    expect(headers).toContain("Cache read");
    expect(headers).not.toContain("API equivalent");
    expect(container.querySelector('[data-testid="usage-totals"]')?.textContent).not.toContain("$");
  });

  it("separates reported spend from the API-equivalent estimate", async () => {
    await render("costs");
    const headers = Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent);
    expect(headers).toEqual(["Model", "Reported spend", "API equivalent"]);
    expect(container.querySelector('[data-testid="usage-notes"]')?.textContent).toContain("not money charged");
    expect(container.querySelector('[data-testid="usage-notes"] a')?.getAttribute("href")).toContain("platform.claude.com");
  });

  it("labels automatic and unattributed usage and never shows a missing price as zero", async () => {
    await render("both");
    const unattributed = container.querySelector('[data-usage-row="unattributed"]');
    expect(container.querySelector('[data-usage-row="automatic"]')?.textContent).toContain("Automatic");
    expect(unattributed?.textContent).toContain("Unattributed");
    expect(unattributed?.textContent).toContain("No price available");
    expect(unattributed?.textContent).not.toContain("$0.00");
  });

  it("saves the Tokens / Costs / Both choice as a user preference", async () => {
    await render("both");
    const tokensButton = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid="usage-display-toggle"] button'))[0]!;
    await act(async () => tokensButton.click());
    expect(mocks.updatePreferences).toHaveBeenCalledWith({ usageDisplay: "tokens" });
  });
});
