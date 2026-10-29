import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  companies,
  companyMemberships,
  createDb,
  folders,
  projectAccessMembers,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { folderRoutes } from "../routes/folders.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres project folder tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

/**
 * Project folders organise projects; they never widen access. A company member
 * outside a private project's access list must not see it counted in a folder
 * and must not be able to file it anywhere.
 */
describeEmbeddedPostgres("project folders", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const previousPrivacyMode = process.env.PAPERCLIP_ISSUE_PRIVACY_MODE;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-project-folders-");
    db = createDb(tempDb.connectionString);
    process.env.PAPERCLIP_ISSUE_PRIVACY_MODE = "enforce";
  }, 20_000);

  afterEach(async () => {
    await db.delete(projectAccessMembers);
    await db.delete(projects);
    await db.delete(folders);
    await db.delete(companyMemberships);
    await db.delete(companies);
  });

  afterAll(async () => {
    if (previousPrivacyMode === undefined) delete process.env.PAPERCLIP_ISSUE_PRIVACY_MODE;
    else process.env.PAPERCLIP_ISSUE_PRIVACY_MODE = previousPrivacyMode;
    await tempDb?.cleanup();
  });

  async function seed() {
    const companyId = randomUUID();
    const openProjectId = randomUUID();
    const privateProjectId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Demo Co",
      issuePrefix: `F${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    });
    await db.insert(projects).values([
      { id: openProjectId, companyId, name: "Open project", visibility: "open" },
      { id: privateProjectId, companyId, name: "Secret project", visibility: "private" },
    ]);
    await db.insert(companyMemberships).values(["member", "outsider"].map((principalId) => ({
      companyId,
      principalType: "user" as const,
      principalId,
      status: "active",
      membershipRole: "admin",
    })));
    await db.insert(projectAccessMembers).values({ companyId, projectId: privateProjectId, subjectType: "user", subjectId: "member" });
    return { companyId, openProjectId, privateProjectId };
  }

  function appFor(companyId: string, userId: string) {
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
    app.use("/api", folderRoutes(db));
    app.use(errorHandler);
    return app;
  }

  async function createFolder(companyId: string, userId: string, name: string, kind = "project") {
    const res = await request(appFor(companyId, userId))
      .post(`/api/companies/${companyId}/folders`)
      .send({ kind, name });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  function moveProject(companyId: string, userId: string, itemId: string, folderId: string | null) {
    return request(appFor(companyId, userId))
      .post(`/api/companies/${companyId}/folders/items/move`)
      .send({ kind: "project", itemId, folderId });
  }

  it("counts only the projects each person can read", async () => {
    const { companyId, openProjectId, privateProjectId } = await seed();
    const clients = await createFolder(companyId, "member", "Clients");

    expect((await moveProject(companyId, "member", openProjectId, clients.id)).status).toBe(200);
    expect((await moveProject(companyId, "member", privateProjectId, clients.id)).status).toBe(200);

    const member = await request(appFor(companyId, "member")).get(`/api/companies/${companyId}/folders?kind=project`);
    expect(member.status).toBe(200);
    expect(member.body.folders).toEqual([expect.objectContaining({ id: clients.id, itemCount: 2 })]);
    expect(member.body.allCount).toBe(2);

    const outsider = await request(appFor(companyId, "outsider")).get(`/api/companies/${companyId}/folders?kind=project`);
    expect(outsider.body.folders).toEqual([expect.objectContaining({ id: clients.id, itemCount: 1 })]);
    expect(outsider.body.allCount).toBe(1);
    expect(JSON.stringify(outsider.body)).not.toContain("Secret project");
  });

  it("answers 404 when someone files a private project they cannot read", async () => {
    const { companyId, privateProjectId } = await seed();
    const clients = await createFolder(companyId, "outsider", "Clients");

    const res = await moveProject(companyId, "outsider", privateProjectId, clients.id);
    expect(res.status).toBe(404);
    const [row] = await db.select({ folderId: projects.folderId }).from(projects).where(eq(projects.id, privateProjectId));
    expect(row?.folderId).toBeNull();
  });

  it("rejects routine folders and keeps projects when a folder is deleted", async () => {
    const { companyId, openProjectId } = await seed();
    const routineFolder = await createFolder(companyId, "member", "Reports", "routine");
    expect((await moveProject(companyId, "member", openProjectId, routineFolder.id)).status).toBe(422);

    const clients = await createFolder(companyId, "member", "Clients");
    expect((await moveProject(companyId, "member", openProjectId, clients.id)).status).toBe(200);
    const deleted = await request(appFor(companyId, "member")).delete(`/api/companies/${companyId}/folders/${clients.id}`);
    expect(deleted.status).toBe(200);
    const [row] = await db.select({ id: projects.id, folderId: projects.folderId }).from(projects).where(eq(projects.id, openProjectId));
    expect(row).toEqual({ id: openProjectId, folderId: null });
  });
});
