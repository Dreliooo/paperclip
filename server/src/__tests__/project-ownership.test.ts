import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  agents,
  companies,
  companyMemberships,
  createDb,
  folders,
  heartbeatRuns,
  issueComments,
  issues,
  projectAccessMembers,
  projectMemberships,
  projects,
  runIdentityContexts,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { folderRoutes } from "../routes/folders.js";
import { projectRoutes } from "../routes/projects.js";
import { creationAttributionForActor, resolveCreationRequester } from "../services/creation-attribution.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres project ownership tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

/**
 * "My projects" differs per person, never shows a project the person cannot
 * read, and attribution only names a requester with evidence. All people and
 * records here are fictional.
 */
describeEmbeddedPostgres("project ownership and attribution", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const previousPrivacyMode = process.env.PAPERCLIP_ISSUE_PRIVACY_MODE;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-project-ownership-");
    db = createDb(tempDb.connectionString);
    process.env.PAPERCLIP_ISSUE_PRIVACY_MODE = "enforce";
  }, 20_000);

  afterEach(async () => {
    await db.execute(sql`truncate table companies cascade`);
  });

  afterAll(async () => {
    if (previousPrivacyMode === undefined) delete process.env.PAPERCLIP_ISSUE_PRIVACY_MODE;
    else process.env.PAPERCLIP_ISSUE_PRIVACY_MODE = previousPrivacyMode;
    await tempDb?.cleanup();
  });

  async function seedCompany() {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Estudio Demo",
      issuePrefix: `W${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    });
    await db.insert(companyMemberships).values(["u-ana", "u-beto"].map((principalId) => ({
      companyId,
      principalType: "user" as const,
      principalId,
      status: "active",
      membershipRole: "admin",
    })));
    const agentId = randomUUID();
    await db.insert(agents).values({ id: agentId, companyId, name: "Director", role: "ceo" });
    return { companyId, agentId };
  }

  function boardApp(companyId: string, userId: string) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.actor = {
        type: "board",
        userId,
        source: "session",
        isInstanceAdmin: false,
        companyIds: [companyId],
        memberships: [{ companyId, membershipRole: "admin", status: "active" }],
      };
      next();
    });
    app.use("/api", projectRoutes(db));
    app.use("/api", folderRoutes(db));
    app.use(errorHandler);
    return app;
  }

  async function createProject(companyId: string, userId: string, name: string, visibility: "open" | "private" = "open") {
    const res = await request(boardApp(companyId, userId))
      .post(`/api/companies/${companyId}/projects`)
      .send({ name, visibility });
    expect(res.status).toBe(201);
    return res.body as { id: string; createdByUserId: string | null; requestedByUserId: string | null };
  }

  async function mine(companyId: string, userId: string) {
    const res = await request(boardApp(companyId, userId)).get(`/api/companies/${companyId}/projects/mine`);
    expect(res.status).toBe(200);
    return res.body as { userId: string; projects: Array<{ projectId: string; reasons: string[] }> };
  }

  it("gives each person a different My projects list with reasons", async () => {
    const { companyId } = await seedCompany();
    const anas = await createProject(companyId, "u-ana", "Balance anual");
    const betos = await createProject(companyId, "u-beto", "Auditoría");
    const shared = await createProject(companyId, "u-ana", "Proyecto compartido");
    await db.insert(issues).values({ companyId, title: "Revisar", projectId: shared.id, assigneeUserId: "u-beto", status: "todo" });

    expect(anas.createdByUserId).toBe("u-ana");
    expect(anas.requestedByUserId).toBeNull();

    const ana = await mine(companyId, "u-ana");
    const beto = await mine(companyId, "u-beto");
    expect(ana.userId).toBe("u-ana");
    expect(ana.projects).toEqual(expect.arrayContaining([
      { projectId: anas.id, reasons: ["created"] },
      { projectId: shared.id, reasons: ["created"] },
    ]));
    expect(ana.projects.map((entry) => entry.projectId)).not.toContain(betos.id);
    expect(beto.projects).toEqual(expect.arrayContaining([
      { projectId: betos.id, reasons: ["created"] },
      { projectId: shared.id, reasons: ["tasks"] },
    ]));
    expect(beto.projects.map((entry) => entry.projectId)).not.toContain(anas.id);

    // "All projects" is unchanged: both people still see every open project.
    const all = await request(boardApp(companyId, "u-beto")).get(`/api/companies/${companyId}/projects`);
    expect(all.body.map((project: { id: string }) => project.id)).toEqual(expect.arrayContaining([anas.id, betos.id, shared.id]));
  });

  it("never lists a private project the person cannot read, even with a task in it", async () => {
    const { companyId } = await seedCompany();
    const secret = await createProject(companyId, "u-ana", "Privado de Ana", "private");
    await db.insert(issues).values({ companyId, title: "Tarea vieja", projectId: secret.id, assigneeUserId: "u-beto", status: "todo" });

    expect((await mine(companyId, "u-ana")).projects).toEqual(expect.arrayContaining([
      { projectId: secret.id, reasons: expect.arrayContaining(["created"]) },
    ]));
    const beto = await mine(companyId, "u-beto");
    expect(beto.projects.map((entry) => entry.projectId)).not.toContain(secret.id);
    expect(JSON.stringify(beto)).not.toContain("Privado de Ana");

    // Sharing it explicitly makes it appear, with the reason.
    await db.insert(projectAccessMembers).values({ companyId, projectId: secret.id, subjectType: "user", subjectId: "u-beto" });
    expect((await mine(companyId, "u-beto")).projects).toEqual(expect.arrayContaining([
      { projectId: secret.id, reasons: ["shared", "tasks"] },
    ]));
  });

  it("drops a project the person left and keeps one they starred", async () => {
    const { companyId } = await seedCompany();
    const left = await createProject(companyId, "u-ana", "Dejado");
    const starred = await createProject(companyId, "u-beto", "Favorito");
    await db.insert(projectMemberships).values([
      { companyId, projectId: left.id, userId: "u-ana", state: "left" },
      { companyId, projectId: starred.id, userId: "u-ana", state: "joined", starredAt: new Date() },
    ]);
    const ana = await mine(companyId, "u-ana");
    expect(ana.projects.map((entry) => entry.projectId)).not.toContain(left.id);
    expect(ana.projects).toEqual(expect.arrayContaining([{ projectId: starred.id, reasons: ["following"] }]));
  });

  it("refuses My projects for agents", async () => {
    const { companyId, agentId } = await seedCompany();
    const app = express();
    app.use((req, _res, next) => {
      req.actor = { type: "agent", agentId, companyId, source: "agent_key" };
      next();
    });
    app.use("/api", projectRoutes(db));
    app.use(errorHandler);
    expect((await request(app).get(`/api/companies/${companyId}/projects/mine`)).status).toBe(403);
  });

  async function seedRun(companyId: string, agentId: string, contexts: Array<{ cause: string; responsibleUserId: string | null; parentContextId?: string | null }>, contextSnapshot: Record<string, unknown> = {}) {
    const runId = randomUUID();
    await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId, contextSnapshot });
    const ids: string[] = [];
    for (const [revision, context] of contexts.entries()) {
      const id = randomUUID();
      await db.insert(runIdentityContexts).values({
        id,
        companyId,
        runId,
        revision,
        responsibleUserId: context.responsibleUserId,
        parentContextId: context.parentContextId ?? ids.at(-1) ?? null,
        cause: context.cause,
        correlationId: revision === 0 ? "dispatch" : `message:${revision}`,
      });
      ids.push(id);
    }
    return { runId, contextIds: ids };
  }

  it("names a requester only with evidence from the run", async () => {
    const { companyId, agentId } = await seedCompany();
    const asked = await seedRun(companyId, agentId, [
      { cause: "dispatch", responsibleUserId: "u-ana" },
      { cause: "instruction", responsibleUserId: "u-beto" },
    ]);
    const nobody = await seedRun(companyId, agentId, [{ cause: "company_default", responsibleUserId: "u-default" }]);
    const delegated = await seedRun(companyId, agentId, [
      { cause: "dispatch", responsibleUserId: "u-beto", parentContextId: asked.contextIds[1] },
    ]);
    const clicked = await seedRun(companyId, agentId, [{ cause: "manual_user_wake", responsibleUserId: "u-ana" }]);

    expect(await resolveCreationRequester(db, { companyId, runId: asked.runId }))
      .toEqual({ requestedByUserId: "u-beto", requestEvidence: "message" });
    expect(await resolveCreationRequester(db, { companyId, runId: nobody.runId })).toBeNull();
    expect(await resolveCreationRequester(db, { companyId, runId: delegated.runId }))
      .toEqual({ requestedByUserId: "u-beto", requestEvidence: "message" });
    expect(await resolveCreationRequester(db, { companyId, runId: clicked.runId }))
      .toEqual({ requestedByUserId: "u-ana", requestEvidence: "manual_wake" });

    const legacyIssueId = randomUUID();
    await db.insert(issues).values({ id: legacyIssueId, companyId, title: "Pedido", status: "todo" });
    const [comment] = await db.insert(issueComments)
      .values({ companyId, issueId: legacyIssueId, body: "Armá la carpeta", authorUserId: "u-ana" })
      .returning();
    const legacy = await seedRun(companyId, agentId, [], { wakeCommentIds: [comment!.id] });
    expect(await resolveCreationRequester(db, { companyId, runId: legacy.runId }))
      .toEqual({ requestedByUserId: "u-ana", requestEvidence: "message" });

    expect(await creationAttributionForActor(db, companyId, {
      type: "agent", agentId, companyId, runId: nobody.runId, onBehalfOfUserId: "u-default", source: "agent_jwt",
    })).toMatchObject({ createdByAgentId: agentId, requestedByUserId: null, requestEvidence: null });
  });

  it("records who created a folder, including an agent's requester", async () => {
    const { companyId, agentId } = await seedCompany();
    const asked = await seedRun(companyId, agentId, [{ cause: "instruction", responsibleUserId: "u-beto" }]);
    const byPerson = await request(boardApp(companyId, "u-ana"))
      .post(`/api/companies/${companyId}/folders`)
      .send({ kind: "project", name: "Clientes", createdByUserId: "u-beto" });
    expect(byPerson.status).toBe(201);
    expect(byPerson.body).toMatchObject({ createdByUserId: "u-ana", createdByAgentId: null, requestedByUserId: null });

    const agentApp = express();
    agentApp.use(express.json());
    agentApp.use((req, _res, next) => {
      req.actor = { type: "agent", agentId, companyId, runId: asked.runId, identityContextId: asked.contextIds[0], source: "agent_key" };
      next();
    });
    agentApp.use("/api", folderRoutes(db));
    agentApp.use(errorHandler);
    const byAgent = await request(agentApp)
      .post(`/api/companies/${companyId}/folders`)
      .send({ kind: "project", name: "Auditorías", parentId: byPerson.body.id });
    expect(byAgent.status).toBe(201);
    expect(byAgent.body).toMatchObject({
      createdByUserId: null,
      createdByAgentId: agentId,
      requestedByUserId: "u-beto",
      requestEvidence: "message",
      parentId: byPerson.body.id,
      depth: 2,
    });
    const [row] = await db.select().from(folders).where(eq(folders.id, byAgent.body.id));
    expect(row?.originRunId).toBe(asked.runId);
  });

  it("leaves historical projects without a record unattributed", async () => {
    const { companyId } = await seedCompany();
    const id = randomUUID();
    await db.insert(projects).values({ id, companyId, name: "Antiguo", privacyOwnerUserId: "u-default" });
    const res = await request(boardApp(companyId, "u-ana")).get(`/api/projects/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ createdByUserId: null, createdByAgentId: null, requestedByUserId: null });
    expect((await mine(companyId, "u-default")).projects).toEqual([]);
  });
});
