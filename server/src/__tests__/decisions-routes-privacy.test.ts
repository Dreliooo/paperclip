import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDecisionService = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  outcome: vi.fn(),
  decide: vi.fn(),
  dismiss: vi.fn(),
  cancel: vi.fn(),
  create: vi.fn(),
  createBundle: vi.fn(),
  stats: vi.fn(),
}));

const mockCanReadDecisionSource = vi.hoisted(() => vi.fn());

vi.mock("../services/decisions.js", () => ({
  decisionService: () => mockDecisionService,
}));

vi.mock("../services/decision-queues.js", () => ({
  canReadDecisionSource: mockCanReadDecisionSource,
}));

const boardActor = {
  type: "board",
  userId: "user-1",
  companyIds: ["company-1"],
  source: "session",
  isInstanceAdmin: false,
};

function decision(id: string, originIssueId: string | null) {
  return { id, companyId: "company-1", originIssueId, originAgentId: "agent-1", status: "open" };
}

async function createApp(actor: Record<string, unknown> = boardActor) {
  vi.resetModules();
  const [{ errorHandler }, { decisionRoutes }] = await Promise.all([
    import("../middleware/index.js") as Promise<typeof import("../middleware/index.js")>,
    import("../routes/decisions.js") as Promise<typeof import("../routes/decisions.js")>,
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = { ...actor };
    next();
  });
  app.use("/api", decisionRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

describe("decision routes respect the origin task's read audience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides a decision from a private task the board user cannot read", async () => {
    mockDecisionService.get.mockResolvedValue(decision("decision-1", "private-issue"));
    mockCanReadDecisionSource.mockResolvedValue(false);
    const app = await createApp();

    const res = await request(app).get("/api/decisions/decision-1");

    expect(res.status).toBe(404);
    expect(mockDecisionService.outcome).not.toHaveBeenCalled();
    expect(mockCanReadDecisionSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "board", userId: "user-1" }),
      "company-1",
      "decision",
      "decision-1",
    );
  });

  it("does not let a user decide or dismiss a decision they cannot read", async () => {
    mockDecisionService.get.mockResolvedValue(decision("decision-1", "private-issue"));
    mockCanReadDecisionSource.mockResolvedValue(false);
    const app = await createApp();

    const decide = await request(app).post("/api/decisions/decision-1/decide").send({ optionId: "approve" });
    const dismiss = await request(app).post("/api/decisions/decision-1/dismiss").send({});

    expect(decide.status).toBe(404);
    expect(dismiss.status).toBe(404);
    expect(mockDecisionService.decide).not.toHaveBeenCalled();
    expect(mockDecisionService.dismiss).not.toHaveBeenCalled();
  });

  it("serves readable decisions", async () => {
    mockDecisionService.get.mockResolvedValue(decision("decision-1", "open-issue"));
    mockDecisionService.outcome.mockResolvedValue({ id: "decision-1" });
    mockCanReadDecisionSource.mockResolvedValue(true);
    const app = await createApp();

    const res = await request(app).get("/api/decisions/decision-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "decision-1" });
  });

  it("filters list results by origin task readability, checking each task once", async () => {
    mockDecisionService.list.mockResolvedValue([
      decision("d-open-1", "open-issue"),
      decision("d-private", "private-issue"),
      decision("d-open-2", "open-issue"),
      decision("d-company", null),
    ]);
    mockCanReadDecisionSource.mockImplementation(
      async (_db: unknown, _actor: unknown, _companyId: string, _kind: string, id: string) => id !== "d-private",
    );
    const app = await createApp();

    const res = await request(app).get("/api/companies/company-1/decisions");

    expect(res.status).toBe(200);
    expect(res.body.map((row: { id: string }) => row.id)).toEqual(["d-open-1", "d-open-2", "d-company"]);
    expect(mockCanReadDecisionSource).toHaveBeenCalledTimes(3);
  });
});
