import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  companies,
  companyMemberships,
  createDb,
  documents,
  issueDocuments,
  issues,
  projectAccessMembers,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { companyRoutes } from "../routes/companies.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres private project read tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

/**
 * Surfaces that list task-owned content must apply the same read audience as
 * the task itself: a company member who is not on a private project's access
 * list must not see its documents through the company-wide artifacts list.
 */
describeEmbeddedPostgres("private project content outside the project routes", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const previousPrivacyMode = process.env.PAPERCLIP_ISSUE_PRIVACY_MODE;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-private-project-gaps-");
    db = createDb(tempDb.connectionString);
    process.env.PAPERCLIP_ISSUE_PRIVACY_MODE = "enforce";
  }, 20_000);

  afterEach(async () => {
    await db.delete(issueDocuments);
    await db.delete(documents);
    await db.delete(issues);
    await db.delete(projectAccessMembers);
    await db.delete(projects);
    await db.delete(agents);
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
    const agentId = randomUUID();
    const openProjectId = randomUUID();
    const privateProjectId = randomUUID();
    const openIssueId = randomUUID();
    const privateIssueId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Demo Co",
      issuePrefix: `D${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    });
    await db.insert(agents).values({ id: agentId, companyId, name: "Writer", role: "engineer" });
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
    await db.insert(issues).values([
      { id: openIssueId, companyId, projectId: openProjectId, title: "Open task", status: "todo", priority: "medium" },
      { id: privateIssueId, companyId, projectId: privateProjectId, title: "Secret task", status: "todo", priority: "medium" },
    ]);
    const openDocId = randomUUID();
    const privateDocId = randomUUID();
    await db.insert(documents).values([
      { id: openDocId, companyId, title: "Open notes", latestBody: "Open body", createdByAgentId: agentId },
      { id: privateDocId, companyId, title: "Secret notes", latestBody: "Secret body", createdByAgentId: agentId },
    ]);
    await db.insert(issueDocuments).values([
      { companyId, issueId: openIssueId, documentId: openDocId, key: "notes" },
      { companyId, issueId: privateIssueId, documentId: privateDocId, key: "notes" },
    ]);
    return { companyId };
  }

  function appFor(companyId: string, userId: string) {
    const app = express();
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
    app.use("/api/companies", companyRoutes(db));
    app.use(errorHandler);
    return app;
  }

  it("hides private project documents from the company artifacts list", async () => {
    const { companyId } = await seed();

    const outsider = await request(appFor(companyId, "outsider")).get(`/api/companies/${companyId}/artifacts`);
    expect(outsider.status).toBe(200);
    const outsiderTitles = outsider.body.artifacts.map((artifact: { title: string }) => artifact.title);
    expect(outsiderTitles).toContain("Open notes");
    expect(outsiderTitles).not.toContain("Secret notes");
    expect(JSON.stringify(outsider.body)).not.toContain("Secret project");

    const member = await request(appFor(companyId, "member")).get(`/api/companies/${companyId}/artifacts`);
    expect(member.body.artifacts.map((artifact: { title: string }) => artifact.title)).toContain("Secret notes");
  });
});
