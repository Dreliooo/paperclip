import { Router } from "express";
import type { Request, Response } from "express";
import type { Db } from "@paperclipai/db";
import {
  createIssueObjectiveSchema,
  issueObjectiveActionSchema,
  updateIssueObjectiveSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import {
  accessService,
  heartbeatService,
  issueObjectiveService,
  issueService,
  logActivity,
} from "../services/index.js";
import type { PluginWorkerManager } from "../services/plugin-worker-manager.js";
import { assertBoard, getAccessibleResource, getActorInfo } from "./authz.js";

/**
 * Objective mode: a person gives a task an objective; its coordinator agent
 * delegates the work as subtasks and a harness-owned supervisor keeps it
 * moving until the coordinator closes the task or an agreed limit is reached.
 * Board users create and control objectives; agents can read them.
 */
export function issueObjectiveRoutes(
  db: Db,
  options: { pluginWorkerManager?: PluginWorkerManager } = {},
) {
  const router = Router();
  const issuesSvc = issueService(db);
  const access = accessService(db);
  const heartbeat = heartbeatService(db, { pluginWorkerManager: options.pluginWorkerManager });
  const objectives = issueObjectiveService(db, {
    enqueueWakeup: heartbeat.wakeup,
    cancelRun: (runId, reason) => heartbeat.cancelRun(runId, reason),
  });

  async function readableIssue(req: Request, res: Response) {
    const issue = await getAccessibleResource(req, res, issuesSvc.getById(req.params.id as string), "Issue not found");
    if (!issue) return null;
    const decision = await access.decide({
      actor: req.actor,
      action: "issue:read",
      resource: {
        type: "issue",
        companyId: issue.companyId,
        issueId: issue.id,
        projectId: issue.projectId ?? null,
        parentIssueId: issue.parentId ?? null,
        assigneeAgentId: issue.assigneeAgentId ?? null,
        assigneeUserId: issue.assigneeUserId ?? null,
        status: issue.status ?? "backlog",
      },
    });
    if (!decision.allowed) {
      res.status(404).json({ error: "Issue not found" });
      return null;
    }
    return issue;
  }

  function objectiveActor(req: Request) {
    return { userId: req.actor.userId ?? null };
  }

  async function logObjective(req: Request, issue: { id: string; companyId: string }, action: string, details: Record<string, unknown>) {
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      agentApiKeyId: actor.agentApiKeyId,
      action,
      entityType: "issue",
      entityId: issue.id,
      details,
    });
  }

  router.get("/issues/:id/objective", async (req, res) => {
    const issue = await readableIssue(req, res);
    if (!issue) return;
    res.json({ objective: await objectives.get(issue.companyId, issue.id) });
  });

  router.post("/issues/:id/objective", validate(createIssueObjectiveSchema), async (req, res) => {
    assertBoard(req);
    const issue = await readableIssue(req, res);
    if (!issue) return;
    const objective = await objectives.create(issue, req.body, objectiveActor(req));
    await logObjective(req, issue, "issue.objective_started", {
      objectiveId: objective.id,
      coordinatorAgentId: objective.coordinatorAgentId,
      limits: objective.limits,
      criteriaCount: objective.successCriteria.length,
    });
    res.status(201).json({ objective });
  });

  router.patch("/issues/:id/objective", validate(updateIssueObjectiveSchema), async (req, res) => {
    assertBoard(req);
    const issue = await readableIssue(req, res);
    if (!issue) return;
    const objective = await objectives.update(issue.companyId, issue.id, req.body, objectiveActor(req));
    await logObjective(req, issue, "issue.objective_updated", {
      objectiveId: objective.id,
      changed: Object.keys(req.body),
      limits: objective.limits,
      status: objective.status,
    });
    res.json({ objective });
  });

  router.post("/issues/:id/objective/actions", validate(issueObjectiveActionSchema), async (req, res) => {
    assertBoard(req);
    const issue = await readableIssue(req, res);
    if (!issue) return;
    const objective = await objectives.act(issue.companyId, issue.id, req.body.action, objectiveActor(req));
    await logObjective(req, issue, `issue.objective_${req.body.action === "stop" ? "stopped" : req.body.action === "pause" ? "paused" : "resumed"}`, {
      objectiveId: objective?.id ?? null,
      status: objective?.status ?? null,
    });
    res.json({ objective });
  });

  return router;
}
