import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { costRoutes } from "../routes/costs.js";
import { errorHandler } from "../middleware/error-handler.js";

const mocks = vi.hoisted(() => ({ report: vi.fn(), decide: vi.fn() }));
vi.mock("../services/usage-breakdown.js", () => ({ usageBreakdownService: () => ({ report: mocks.report }) }));
vi.mock("../services/index.js", () => ({
  heartbeatService: () => ({}), costService: () => ({}), financeService: () => ({}), budgetService: () => ({}),
  companyService: () => ({}), agentService: () => ({}), issueService: () => ({}), accessService: () => ({ decide: mocks.decide }),
}));
vi.mock("../services/accounting-integrity.js", () => ({ accountingIntegrityService: () => ({}) }));
vi.mock("../services/billing-reconciliation.js", () => ({ billingReconciliationService: () => ({}) }));

const companyId = "11111111-1111-4111-8111-111111111111";
const path = `/api/companies/${companyId}/costs/usage-breakdown`;

function app(type: "board" | "agent" = "board") {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    req.actor = type === "board"
      ? { type: "board", source: "session", userId: "alice", companyIds: [companyId], memberships: [{ companyId, status: "active", membershipRole: "member" }] } as typeof req.actor
      : { type: "agent", agentId: "agent", companyId } as typeof req.actor;
    next();
  });
  instance.use("/api", costRoutes({} as Db));
  instance.use(errorHandler);
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decide.mockResolvedValue({ allowed: true });
  mocks.report.mockResolvedValue({ groupBy: "model", rows: [], totals: {}, providers: [], rateCards: [] });
});

describe("usage breakdown route", () => {
  it("passes grouping, provider and period to the service", async () => {
    const response = await request(app()).get(`${path}?groupBy=user&provider=anthropic&period=all`);
    expect(response.status).toBe(200);
    expect(mocks.report).toHaveBeenCalledWith(companyId, { groupBy: "user", provider: "anthropic", range: { allTime: true } });
  });

  it("defaults to the model grouping", async () => {
    await request(app()).get(path);
    expect(mocks.report).toHaveBeenCalledWith(companyId, { groupBy: "model", provider: null, range: undefined });
  });

  it("rejects unknown groupings, other companies and denied cost visibility", async () => {
    expect((await request(app()).get(`${path}?groupBy=project`)).status).toBe(400);
    expect((await request(app()).get("/api/companies/other/costs/usage-breakdown")).status).toBe(403);
    mocks.decide.mockResolvedValue({ allowed: false });
    expect((await request(app()).get(path)).status).toBe(403);
    expect(mocks.report).not.toHaveBeenCalled();
  });
});
