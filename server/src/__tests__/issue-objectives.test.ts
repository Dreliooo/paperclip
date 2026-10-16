import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  agents,
  companies,
  costEvents,
  createDb,
  issueComments,
  issueObjectives,
  issues,
  issueTreeHolds,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueObjectiveService } from "../services/issue-objectives.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres objective tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issue objectives", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-objectives-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.execute(sql`truncate table companies cascade`);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seed() {
    const companyId = randomUUID();
    const coordinatorId = randomUUID();
    const workerId = randomUUID();
    const rootId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Demo Co",
      issuePrefix: `O${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    });
    await db.insert(agents).values([
      { id: coordinatorId, companyId, name: "Lead", role: "ceo" },
      { id: workerId, companyId, name: "Writer", role: "engineer", reportsTo: coordinatorId },
    ]);
    await db.insert(issues).values({ id: rootId, companyId, title: "Monthly report", status: "backlog", priority: "medium" });
    const root = await db.select().from(issues).where(eq(issues.id, rootId)).then((rows) => rows[0]!);
    return { companyId, coordinatorId, workerId, rootId, root };
  }

  function service() {
    const enqueueWakeup = vi.fn(async () => ({ id: randomUUID() }));
    const cancelRun = vi.fn(async () => undefined);
    return { svc: issueObjectiveService(db, { enqueueWakeup, cancelRun }), enqueueWakeup, cancelRun };
  }

  async function addChild(companyId: string, parentId: string, assigneeAgentId: string, overrides: Partial<typeof issues.$inferInsert> = {}) {
    const id = randomUUID();
    await db.insert(issues).values({
      id,
      companyId,
      parentId,
      title: "Draft section",
      status: "todo",
      priority: "medium",
      assigneeAgentId,
      ...overrides,
    });
    return id;
  }

  it("assigns the coordinator, posts the brief and wakes it", async () => {
    const { companyId, coordinatorId, rootId, root } = await seed();
    const { svc, enqueueWakeup } = service();

    const objective = await svc.create(root, {
      objective: "Publish the monthly report",
      successCriteria: ["Report uploaded"],
      coordinatorAgentId: coordinatorId,
      maxSpendCents: 500,
      maxTokens: null,
      deadlineAt: null,
    }, { userId: "board-user" });

    expect(objective).toMatchObject({ status: "active", coordinatorAgentId: coordinatorId, limits: { maxSpendCents: 500 } });
    const updatedRoot = await db.select().from(issues).where(eq(issues.id, rootId)).then((rows) => rows[0]!);
    expect(updatedRoot).toMatchObject({ assigneeAgentId: coordinatorId, status: "todo" });
    const comments = await db.select().from(issueComments).where(eq(issueComments.issueId, rootId));
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toContain("Publish the monthly report");
    expect(comments[0]!.body).toContain("Report uploaded");
    expect(enqueueWakeup).toHaveBeenCalledWith(coordinatorId, expect.objectContaining({
      reason: "issue_commented",
      contextSnapshot: expect.objectContaining({ issueId: rootId, wakeCommentId: comments[0]!.id }),
    }));

    await expect(svc.create(updatedRoot, {
      objective: "Again",
      successCriteria: [],
      coordinatorAgentId: coordinatorId,
      maxSpendCents: null,
      maxTokens: null,
      deadlineAt: null,
    }, { userId: "board-user" })).rejects.toMatchObject({ status: 409 });
  });

  it("nudges the coordinator about a quiet subtask, then waits", async () => {
    const { companyId, coordinatorId, workerId, rootId, root } = await seed();
    const { svc, enqueueWakeup } = service();
    await svc.create(root, {
      objective: "Ship it",
      successCriteria: [],
      coordinatorAgentId: coordinatorId,
      maxSpendCents: null,
      maxTokens: null,
      deadlineAt: null,
    }, { userId: null });
    const longAgo = new Date(Date.now() - 3 * 60 * 60_000);
    await addChild(companyId, rootId, workerId, { createdAt: longAgo, updatedAt: longAgo });
    enqueueWakeup.mockClear();

    const now = new Date();
    expect(await svc.reconcile({ now, companyId })).toMatchObject({ checked: 1, nudged: 1 });
    const digest = await db.select().from(issueComments)
      .where(and(eq(issueComments.issueId, rootId), eq(issueComments.authorType, "system")))
      .then((rows) => rows.find((comment) => comment.body.includes("Objective check")));
    expect(digest?.body).toContain("Not moving");
    expect(enqueueWakeup).toHaveBeenCalledTimes(1);

    const later = new Date(now.getTime() + 5 * 60_000);
    expect(await svc.reconcile({ now: later, companyId })).toMatchObject({ checked: 1, nudged: 0 });
    expect(enqueueWakeup).toHaveBeenCalledTimes(1);
  });

  it("pauses the subtree at a limit and resumes when the limit is raised", async () => {
    const { companyId, coordinatorId, workerId, rootId, root } = await seed();
    const { svc } = service();
    await svc.create(root, {
      objective: "Ship it",
      successCriteria: [],
      coordinatorAgentId: coordinatorId,
      maxSpendCents: 500,
      maxTokens: null,
      deadlineAt: null,
    }, { userId: null });
    const childId = await addChild(companyId, rootId, workerId, { status: "in_progress" });
    await db.insert(costEvents).values({
      companyId,
      agentId: workerId,
      issueId: childId,
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      inputTokens: 1_000,
      outputTokens: 100,
      costCents: 600,
      occurredAt: new Date(),
    });

    expect(await svc.reconcile({ companyId })).toMatchObject({ limited: 1 });
    const limited = await db.select().from(issueObjectives).where(eq(issueObjectives.issueId, rootId)).then((rows) => rows[0]!);
    expect(limited).toMatchObject({ status: "limit_reached", limitReason: "spend" });
    expect(limited.pauseHoldId).toBeTruthy();
    const hold = await db.select().from(issueTreeHolds).where(eq(issueTreeHolds.id, limited.pauseHoldId!)).then((rows) => rows[0]!);
    expect(hold).toMatchObject({ mode: "pause", status: "active" });

    const resumed = await svc.update(companyId, rootId, { maxSpendCents: 1_000 }, { userId: "board-user" });
    expect(resumed).toMatchObject({ status: "active", limitReason: null, usage: { spentCents: 600 } });
    const released = await db.select().from(issueTreeHolds).where(eq(issueTreeHolds.id, limited.pauseHoldId!)).then((rows) => rows[0]!);
    expect(released.status).toBe("released");
  });

  it("ends when the coordinator closes the task", async () => {
    const { companyId, coordinatorId, rootId, root } = await seed();
    const { svc } = service();
    await svc.create(root, {
      objective: "Ship it",
      successCriteria: [],
      coordinatorAgentId: coordinatorId,
      maxSpendCents: null,
      maxTokens: null,
      deadlineAt: null,
    }, { userId: null });
    await db.update(issues).set({ status: "done" }).where(eq(issues.id, rootId));

    expect(await svc.reconcile({ companyId })).toMatchObject({ finished: 1 });
    expect(await svc.get(companyId, rootId)).toMatchObject({ status: "achieved" });
  });

  it("refuses to run inside a conversation", async () => {
    const { coordinatorId, root } = await seed();
    const { svc } = service();
    await expect(svc.create({ ...root, conversationAgentId: coordinatorId }, {
      objective: "Ship it",
      successCriteria: [],
      coordinatorAgentId: coordinatorId,
      maxSpendCents: null,
      maxTokens: null,
      deadlineAt: null,
    }, { userId: null })).rejects.toMatchObject({ status: 422 });
  });
});
