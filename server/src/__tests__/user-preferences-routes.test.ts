import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUserPreferenceService = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../services/user-preferences.js", () => ({
  userPreferenceService: () => mockUserPreferenceService,
}));

async function createApp(actor: Record<string, unknown>) {
  vi.resetModules();
  const [{ userPreferenceRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/user-preferences.js"),
    import("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor as never;
    next();
  });
  app.use("/api", userPreferenceRoutes({} as never));
  app.use(errorHandler);
  return app;
}

const board = { type: "board", userId: "user-1", companyIds: ["company-1"], source: "session", isInstanceAdmin: false };

describe("user preference routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserPreferenceService.get.mockResolvedValue({ locale: null, usageDisplay: null, updatedAt: null });
    mockUserPreferenceService.update.mockImplementation(async (_userId: string, patch: Record<string, unknown>) => ({
      locale: null,
      usageDisplay: null,
      ...patch,
      updatedAt: null,
    }));
  });

  it("reads the signed-in user's preferences", async () => {
    const app = await createApp(board);
    const res = await request(app).get("/api/user-preferences/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ locale: null, usageDisplay: null, updatedAt: null });
    expect(mockUserPreferenceService.get).toHaveBeenCalledWith("user-1");
  });

  it("updates only the session user's own preferences", async () => {
    const app = await createApp(board);
    const res = await request(app).patch("/api/user-preferences/me").send({ locale: "es", usageDisplay: "tokens" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ locale: "es", usageDisplay: "tokens" });
    expect(mockUserPreferenceService.update).toHaveBeenCalledWith("user-1", { locale: "es", usageDisplay: "tokens" });
  });

  it("rejects unsupported values and unknown fields", async () => {
    const app = await createApp(board);
    expect((await request(app).patch("/api/user-preferences/me").send({ locale: "xx" })).status).toBe(400);
    expect((await request(app).patch("/api/user-preferences/me").send({ usageDisplay: "dollars" })).status).toBe(400);
    expect((await request(app).patch("/api/user-preferences/me").send({ userId: "user-2" })).status).toBe(400);
    expect(mockUserPreferenceService.update).not.toHaveBeenCalled();
  });

  it("refuses agents", async () => {
    const app = await createApp({ type: "agent", agentId: "agent-1", companyId: "company-1" });
    const res = await request(app).get("/api/user-preferences/me");
    expect(res.status).toBe(403);
    expect(mockUserPreferenceService.get).not.toHaveBeenCalled();
  });
});
