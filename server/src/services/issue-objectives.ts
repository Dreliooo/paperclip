import { createHash } from "node:crypto";
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  costEvents,
  heartbeatRuns,
  issueComments,
  issueObjectives,
  issues,
  userPreferences,
} from "@paperclipai/db";
import {
  decideObjectiveNudge,
  evaluateObjectiveLimit,
  objectiveProgressFingerprint,
  summarizeObjectiveTree,
  type CreateIssueObjective,
  type IssueObjective,
  type IssueObjectiveAction,
  type IssueObjectiveLimitReason,
  type IssueObjectiveLimits,
  type IssueObjectiveProgress,
  type IssueObjectiveStatus,
  type IssueObjectiveUsage,
  type ObjectiveNudgeReason,
  type ObjectiveTreeRow,
  type UpdateIssueObjective,
} from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { assertAssignableAgent } from "./agent-assignability.js";
import { issueService } from "./issues.js";
import { issueTreeControlService } from "./issue-tree-control.js";

type ObjectiveRow = typeof issueObjectives.$inferSelect;
type IssueRow = typeof issues.$inferSelect;

type ObjectiveWakeup = (
  agentId: string,
  opts?: {
    source?: "timer" | "assignment" | "on_demand" | "automation";
    triggerDetail?: "manual" | "ping" | "callback" | "system";
    reason?: string | null;
    payload?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
    requestedByActorType?: "user" | "agent" | "system";
    requestedByActorId?: string | null;
    contextSnapshot?: Record<string, unknown>;
  },
) => Promise<{ id: string } | null>;

export type IssueObjectiveServiceDeps = {
  enqueueWakeup?: ObjectiveWakeup;
  cancelRun?: (runId: string, reason?: string) => Promise<unknown>;
};

export type IssueObjectiveActor = {
  userId: string | null;
  agentId?: string | null;
  runId?: string | null;
};

const OPEN_STATUSES: IssueObjectiveStatus[] = ["active", "paused", "limit_reached"];
const RESUMABLE_TASK_STATUSES = ["todo", "in_progress", "in_review"];
const ACTIVE_RUN_STATUSES = ["queued", "running"];
/** Each objective is examined at most this often by the periodic sweep. */
const RECHECK_MS = 60_000;
const MAX_RESUME_WAKES = 50;

type Locale = "en" | "es";

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function limitsOf(row: ObjectiveRow): IssueObjectiveLimits {
  return {
    maxSpendCents: row.maxSpendCents ?? null,
    maxTokens: row.maxTokens ?? null,
    deadlineAt: iso(row.deadlineAt),
  };
}

function issueLink(issue: { identifier: string | null; id: string }) {
  const identifier = issue.identifier?.trim();
  if (!identifier) return issue.id;
  const prefix = identifier.split("-")[0] || "PAP";
  return `[${identifier}](/${prefix}/issues/${identifier})`;
}

function formatMoney(cents: number, locale: Locale) {
  const amount = (cents / 100).toLocaleString(locale === "es" ? "es-AR" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `US$ ${amount}`;
}

function formatTokens(tokens: number, locale: Locale) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toLocaleString(locale === "es" ? "es-AR" : "en-US", { maximumFractionDigits: 1 })}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

function formatRemaining(deadlineAt: string, now: Date, locale: Locale) {
  const minutes = Math.max(0, Math.round((Date.parse(deadlineAt) - now.getTime()) / 60_000));
  if (minutes >= 120) return locale === "es" ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 60)}h`;
  return locale === "es" ? `${minutes} min` : `${minutes}m`;
}

function limitsLine(limits: IssueObjectiveLimits, usage: IssueObjectiveUsage, now: Date, locale: Locale) {
  const es = locale === "es";
  const parts: string[] = [];
  parts.push(limits.maxSpendCents !== null
    ? `${es ? "Gasto" : "Spend"}: ${formatMoney(usage.spentCents, locale)} ${es ? "de" : "of"} ${formatMoney(limits.maxSpendCents, locale)}`
    : `${es ? "Gasto" : "Spend"}: ${formatMoney(usage.spentCents, locale)}`);
  parts.push(limits.maxTokens !== null
    ? `Tokens: ${formatTokens(usage.tokens, locale)} ${es ? "de" : "of"} ${formatTokens(limits.maxTokens, locale)}`
    : `Tokens: ${formatTokens(usage.tokens, locale)}`);
  if (limits.deadlineAt) {
    parts.push(`${es ? "Tiempo restante" : "Time left"}: ${formatRemaining(limits.deadlineAt, now, locale)}`);
  }
  return parts.join(" · ");
}

export function renderObjectiveBrief(input: {
  locale: Locale;
  objective: string;
  successCriteria: string[];
  coordinatorName: string;
  limits: IssueObjectiveLimits;
}) {
  const es = input.locale === "es";
  const quoted = input.objective.split("\n").map((line) => `> ${line}`).join("\n");
  const criteria = input.successCriteria.length > 0
    ? input.successCriteria.map((criterion) => `- ${criterion}`).join("\n")
    : (es ? "- (sin criterios explícitos: usá tu criterio y explicalo al cerrar)" : "- (no explicit criteria: use your judgement and explain it when closing)");
  const limitParts: string[] = [];
  if (input.limits.maxSpendCents !== null) limitParts.push(`${es ? "gasto" : "spend"} ${formatMoney(input.limits.maxSpendCents, input.locale)}`);
  if (input.limits.maxTokens !== null) limitParts.push(`${formatTokens(input.limits.maxTokens, input.locale)} tokens`);
  if (input.limits.deadlineAt) limitParts.push(`${es ? "hasta" : "until"} ${input.limits.deadlineAt}`);
  const limits = limitParts.length > 0 ? limitParts.join(" · ") : (es ? "sin límites propios" : "no objective limits");
  if (es) {
    return [
      `**Objetivo asignado.** Coordina: ${input.coordinatorName}.`,
      "",
      quoted,
      "",
      "**Criterios de terminado**",
      criteria,
      "",
      `**Límites:** ${limits}. Si se llega a uno, el trabajo se pausa y se le pregunta a la persona.`,
      "",
      "**Cómo trabajar**",
      "1. Dividí el objetivo en subtareas con esta tarea como padre y asignalas a los agentes adecuados.",
      "2. Paperclip te va a avisar acá cuando una subtarea cambie, se trabe o quede sin respuesta.",
      "3. Seguí hasta cumplirlo: preguntá, reasigná o dividí lo que no avance.",
      "4. Si querés, pedile a otro agente que valide el resultado. Es opcional.",
      "5. Cuando esté cumplido, marcá esta tarea como terminada con un comentario que muestre la evidencia de cada criterio.",
      "6. Si necesitás una decisión de una persona, pedila y seguí con lo que no dependa de ella.",
    ].join("\n");
  }
  return [
    `**Objective assigned.** Coordinator: ${input.coordinatorName}.`,
    "",
    quoted,
    "",
    "**Done when**",
    criteria,
    "",
    `**Limits:** ${limits}. Reaching one pauses the work and asks the person.`,
    "",
    "**How to work**",
    "1. Break the objective into subtasks with this task as their parent and assign them to the right agents.",
    "2. Paperclip will post here when a subtask changes, gets blocked or goes quiet.",
    "3. Keep going until it is met: ask, reassign or split anything that is not moving.",
    "4. You may ask another agent to validate the result. This is optional.",
    "5. When it is met, mark this task done with a comment that shows the evidence for each criterion.",
    "6. If you need a decision from a person, ask for it and continue with whatever does not depend on it.",
  ].join("\n");
}

export function renderObjectiveDigest(input: {
  locale: Locale;
  reason: ObjectiveNudgeReason;
  progress: IssueObjectiveProgress;
  limits: IssueObjectiveLimits;
  usage: IssueObjectiveUsage;
  now: Date;
}) {
  const es = input.locale === "es";
  const lead = {
    progress: es ? "Hubo cambios en las subtareas." : "Subtasks changed.",
    stalled: es ? "Hay subtareas sin avance." : "Some subtasks are not moving.",
    idle: es ? "No hubo movimiento en las últimas horas." : "Nothing has moved for a while.",
  }[input.reason];
  const p = input.progress;
  const counts = es
    ? `${p.doneTasks} de ${p.totalTasks} subtareas terminadas · ${p.activeTasks} en curso · ${p.blockedTasks} bloqueadas · ${p.waitingTasks} esperando`
    : `${p.doneTasks} of ${p.totalTasks} subtasks done · ${p.activeTasks} in progress · ${p.blockedTasks} blocked · ${p.waitingTasks} waiting`;
  const lines = [
    `**${es ? "Revisión del objetivo" : "Objective check"}** · ${lead}`,
    "",
    p.totalTasks > 0 ? counts : (es ? "Todavía no hay subtareas." : "No subtasks yet."),
  ];
  if (p.stalledTasks.length > 0) {
    lines.push("", es ? "**Sin avance:**" : "**Not moving:**");
    for (const task of p.stalledTasks.slice(0, 10)) {
      lines.push(`- ${issueLink({ identifier: task.identifier, id: task.issueId })} ${task.title} · ${task.idleMinutes} min`);
    }
  }
  lines.push("", limitsLine(input.limits, input.usage, input.now, input.locale), "");
  lines.push(es
    ? "Seguí coordinando: preguntá, reasigná o dividí lo que no avance. Cuando el objetivo esté cumplido, cerrá esta tarea con la evidencia de cada criterio."
    : "Keep coordinating: ask, reassign or split whatever is not moving. When the objective is met, close this task with the evidence for each criterion.");
  return lines.join("\n");
}

function renderLimitReached(locale: Locale, reason: IssueObjectiveLimitReason, limits: IssueObjectiveLimits, usage: IssueObjectiveUsage, now: Date) {
  const es = locale === "es";
  const what = {
    spend: es ? "el tope de gasto" : "the spend limit",
    tokens: es ? "el tope de tokens" : "the token limit",
    deadline: es ? "el tope de tiempo" : "the time limit",
  }[reason];
  return es
    ? `**Objetivo en pausa:** se alcanzó ${what}. El trabajo de esta tarea y sus subtareas quedó pausado.\n\n${limitsLine(limits, usage, now, locale)}\n\nPara seguir, ampliá el tope desde la tarjeta del objetivo. Si no, frenalo.`
    : `**Objective paused:** ${what} was reached. Work on this task and its subtasks is paused.\n\n${limitsLine(limits, usage, now, locale)}\n\nTo continue, raise the limit from the objective card. Otherwise, stop it.`;
}

export function issueObjectiveService(db: Db, deps: IssueObjectiveServiceDeps = {}) {
  const treeControl = issueTreeControlService(db);
  const issuesSvc = issueService(db);

  async function localeFor(userId: string | null): Promise<Locale> {
    if (!userId) return "en";
    const row = await db
      .select({ locale: userPreferences.locale })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .then((rows) => rows[0] ?? null);
    return row?.locale?.startsWith("es") ? "es" : "en";
  }

  async function getRow(companyId: string, issueId: string) {
    return db
      .select()
      .from(issueObjectives)
      .where(and(eq(issueObjectives.companyId, companyId), eq(issueObjectives.issueId, issueId)))
      .then((rows) => rows[0] ?? null);
  }

  async function loadTree(row: Pick<ObjectiveRow, "companyId" | "issueId" | "startedAt">): Promise<ObjectiveTreeRow[]> {
    const tree = (await treeControl.listTreeIssues(row.companyId, row.issueId))
      .filter((issue) => issue.id === row.issueId || (!issue.hiddenAt && !issue.harnessKind));
    const ids = tree.map((issue) => issue.id);
    const [commentStats, runStats] = await Promise.all([
      db
        .select({
          issueId: issueComments.issueId,
          count: sql<number>`count(*)::int`,
          lastAt: sql<Date | null>`max(${issueComments.createdAt})`,
        })
        .from(issueComments)
        .where(and(eq(issueComments.companyId, row.companyId), inArray(issueComments.issueId, ids)))
        .groupBy(issueComments.issueId),
      db
        .select({
          issueId: sql<string>`${heartbeatRuns.contextSnapshot} ->> 'issueId'`,
          active: sql<boolean>`bool_or(${heartbeatRuns.status} in ('queued', 'running'))`,
          lastAt: sql<Date | null>`max(coalesce(${heartbeatRuns.finishedAt}, ${heartbeatRuns.startedAt}, ${heartbeatRuns.createdAt}))`,
        })
        .from(heartbeatRuns)
        .where(and(
          eq(heartbeatRuns.companyId, row.companyId),
          gte(heartbeatRuns.createdAt, row.startedAt),
          inArray(sql<string>`${heartbeatRuns.contextSnapshot} ->> 'issueId'`, ids),
        ))
        .groupBy(sql`${heartbeatRuns.contextSnapshot} ->> 'issueId'`),
    ]);
    const comments = new Map(commentStats.map((stat) => [stat.issueId, stat]));
    const runs = new Map(runStats.map((stat) => [stat.issueId, stat]));
    return tree.map((issue) => {
      const comment = comments.get(issue.id);
      const run = runs.get(issue.id);
      const times = [issue.updatedAt, comment?.lastAt, run?.lastAt]
        .filter((value): value is Date => Boolean(value))
        .map((value) => new Date(value).getTime());
      return {
        id: issue.id,
        parentId: issue.parentId ?? null,
        identifier: issue.identifier ?? null,
        title: issue.title,
        status: issue.status,
        assigneeAgentId: issue.assigneeAgentId ?? null,
        assigneeUserId: issue.assigneeUserId ?? null,
        lastActivityAt: new Date(Math.max(...times)).toISOString(),
        commentCount: Number(comment?.count ?? 0),
        hasActiveRun: Boolean(run?.active),
      } satisfies ObjectiveTreeRow;
    });
  }

  async function loadUsage(companyId: string, issueIds: string[], since: Date): Promise<IssueObjectiveUsage> {
    if (issueIds.length === 0) return { spentCents: 0, tokens: 0 };
    const [row] = await db
      .select({
        spentCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::float8`,
        tokens: sql<number>`coalesce(sum(${costEvents.inputTokens} + ${costEvents.cachedInputTokens} + ${costEvents.outputTokens}), 0)::float8`,
      })
      .from(costEvents)
      .where(and(
        eq(costEvents.companyId, companyId),
        inArray(costEvents.issueId, issueIds),
        gte(costEvents.occurredAt, since),
      ));
    return { spentCents: Math.round(Number(row?.spentCents ?? 0)), tokens: Math.round(Number(row?.tokens ?? 0)) };
  }

  async function coordinatorBusy(companyId: string, agentId: string) {
    const run = await db
      .select({ id: heartbeatRuns.id })
      .from(heartbeatRuns)
      .where(and(
        eq(heartbeatRuns.companyId, companyId),
        eq(heartbeatRuns.agentId, agentId),
        inArray(heartbeatRuns.status, ACTIVE_RUN_STATUSES),
      ))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    return Boolean(run);
  }

  function toDto(row: ObjectiveRow, usage: IssueObjectiveUsage, progress: IssueObjectiveProgress): IssueObjective {
    return {
      id: row.id,
      companyId: row.companyId,
      issueId: row.issueId,
      objective: row.objective,
      successCriteria: row.successCriteria ?? [],
      coordinatorAgentId: row.coordinatorAgentId,
      status: row.status as IssueObjectiveStatus,
      limits: limitsOf(row),
      limitReason: (row.limitReason as IssueObjectiveLimitReason | null) ?? null,
      startedAt: row.startedAt.toISOString(),
      endedAt: iso(row.endedAt),
      lastCheckAt: iso(row.lastCheckAt),
      lastNudgeAt: iso(row.lastNudgeAt),
      nudgeCount: row.nudgeCount,
      createdByUserId: row.createdByUserId ?? null,
      usage,
      progress,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async function describe(row: ObjectiveRow, now = new Date()) {
    const tree = await loadTree(row);
    const usage = await loadUsage(row.companyId, tree.map((issue) => issue.id), row.startedAt);
    return toDto(row, usage, summarizeObjectiveTree(row.issueId, tree, now));
  }

  async function postSystemComment(companyId: string, issueId: string, body: string) {
    const [comment] = await db
      .insert(issueComments)
      .values({ companyId, issueId, authorType: "system", body })
      .returning({ id: issueComments.id });
    await db.update(issues).set({ updatedAt: new Date() }).where(eq(issues.id, issueId));
    return comment!;
  }

  async function wakeCoordinator(row: Pick<ObjectiveRow, "id" | "issueId" | "coordinatorAgentId">, commentId: string, source: string, idempotencyKey: string) {
    if (!deps.enqueueWakeup) return null;
    return deps.enqueueWakeup(row.coordinatorAgentId, {
      source: "automation",
      triggerDetail: "system",
      reason: "issue_commented",
      payload: { issueId: row.issueId, commentId, mutation: "comment", objectiveId: row.id },
      idempotencyKey,
      requestedByActorType: "system",
      requestedByActorId: "issue_objective",
      contextSnapshot: {
        issueId: row.issueId,
        taskId: row.issueId,
        commentId,
        wakeCommentId: commentId,
        wakeReason: "issue_commented",
        source,
        objectiveId: row.id,
      },
    });
  }

  async function pauseSubtree(row: ObjectiveRow, reason: string, actor: IssueObjectiveActor) {
    const { hold, preview } = await treeControl.createHold(row.companyId, row.issueId, {
      mode: "pause",
      reason,
      actor: actor.userId
        ? { actorType: "user", actorId: actor.userId, userId: actor.userId }
        : { actorType: "system", actorId: "issue_objective" },
    });
    for (const run of preview.activeRuns) {
      await Promise.resolve(deps.cancelRun?.(run.id, reason)).catch(() => null);
    }
    await treeControl.cancelUnclaimedWakeupsForTree(row.companyId, row.issueId, reason);
    return hold.id;
  }

  async function resumeSubtree(row: ObjectiveRow, actor: IssueObjectiveActor) {
    if (row.pauseHoldId) {
      try {
        await treeControl.releaseHold(row.companyId, row.issueId, row.pauseHoldId, {
          reason: "Objective resumed",
          actor: actor.userId
            ? { actorType: "user", actorId: actor.userId, userId: actor.userId }
            : { actorType: "system", actorId: "issue_objective" },
        });
      } catch (error) {
        // Someone may already have released the hold from the task tree controls.
        if ((error as { status?: number }).status !== 409 && (error as { status?: number }).status !== 404) throw error;
      }
    }
    if (!deps.enqueueWakeup) return;
    const tree = await treeControl.listTreeIssues(row.companyId, row.issueId);
    const toWake = tree
      .filter((issue) => issue.id !== row.issueId && issue.assigneeAgentId && RESUMABLE_TASK_STATUSES.includes(issue.status))
      .slice(0, MAX_RESUME_WAKES);
    for (const issue of toWake) {
      await deps.enqueueWakeup(issue.assigneeAgentId!, {
        source: "assignment",
        triggerDetail: "system",
        reason: "issue_tree_resumed",
        payload: { issueId: issue.id, rootIssueId: row.issueId, objectiveId: row.id },
        requestedByActorType: actor.userId ? "user" : "system",
        requestedByActorId: actor.userId ?? "issue_objective",
        contextSnapshot: {
          issueId: issue.id,
          taskId: issue.id,
          wakeReason: "issue_tree_resumed",
          source: "issue_objective.resume",
          rootIssueId: row.issueId,
        },
      }).catch(() => null);
    }
  }

  async function updateRow(id: string, patch: Partial<typeof issueObjectives.$inferInsert>) {
    const [updated] = await db
      .update(issueObjectives)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(issueObjectives.id, id))
      .returning();
    return updated!;
  }

  async function get(companyId: string, issueId: string) {
    const row = await getRow(companyId, issueId);
    return row ? describe(row) : null;
  }

  async function create(issue: IssueRow, input: CreateIssueObjective, actor: IssueObjectiveActor) {
    if (issue.conversationAgentId) {
      throw unprocessable("Objectives run on a task. Start one from a new task instead of a conversation.");
    }
    const existing = await getRow(issue.companyId, issue.id);
    if (existing && OPEN_STATUSES.includes(existing.status as IssueObjectiveStatus)) {
      throw conflict("This task already has an objective in progress");
    }
    await assertAssignableAgent(db, issue.companyId, input.coordinatorAgentId);
    const coordinator = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(and(eq(agents.id, input.coordinatorAgentId), eq(agents.companyId, issue.companyId)))
      .then((rows) => rows[0] ?? null);
    if (!coordinator) throw notFound("Coordinator agent not found");

    const reopen = ["backlog", "done", "cancelled"].includes(issue.status);
    if (issue.assigneeAgentId !== coordinator.id || issue.assigneeUserId || reopen) {
      await issuesSvc.update(issue.id, {
        assigneeAgentId: coordinator.id,
        assigneeUserId: null,
        ...(reopen ? { status: "todo" } : {}),
        actorUserId: actor.userId,
        companyGuard: issue.companyId,
      });
    }

    const now = new Date();
    const values = {
      companyId: issue.companyId,
      issueId: issue.id,
      objective: input.objective,
      successCriteria: input.successCriteria,
      coordinatorAgentId: coordinator.id,
      status: "active",
      maxSpendCents: input.maxSpendCents,
      maxTokens: input.maxTokens,
      deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null,
      limitReason: null,
      pauseHoldId: null,
      lastCheckAt: null,
      lastNudgeAt: null,
      nudgeCount: 0,
      lastProgressFingerprint: null,
      lastProgressAt: now,
      createdByUserId: actor.userId,
      startedAt: now,
      endedAt: null,
      updatedAt: now,
    } satisfies Partial<typeof issueObjectives.$inferInsert>;
    const row = existing
      ? await updateRow(existing.id, values)
      : await db.insert(issueObjectives).values(values).returning().then((rows) => rows[0]!);

    const locale = await localeFor(actor.userId);
    const comment = await postSystemComment(issue.companyId, issue.id, renderObjectiveBrief({
      locale,
      objective: row.objective,
      successCriteria: row.successCriteria ?? [],
      coordinatorName: coordinator.name,
      limits: limitsOf(row),
    }));
    await wakeCoordinator(row, comment.id, "issue_objective.start", `issue-objective-start:${row.id}:${row.startedAt.toISOString()}`);
    return describe(row, now);
  }

  async function update(companyId: string, issueId: string, patch: UpdateIssueObjective, actor: IssueObjectiveActor) {
    const row = await getRow(companyId, issueId);
    if (!row) throw notFound("Objective not found");
    if (!OPEN_STATUSES.includes(row.status as IssueObjectiveStatus)) {
      throw conflict("This objective has already ended");
    }
    let next = await updateRow(row.id, {
      ...(patch.objective !== undefined ? { objective: patch.objective } : {}),
      ...(patch.successCriteria !== undefined ? { successCriteria: patch.successCriteria } : {}),
      ...(patch.maxSpendCents !== undefined ? { maxSpendCents: patch.maxSpendCents } : {}),
      ...(patch.maxTokens !== undefined ? { maxTokens: patch.maxTokens } : {}),
      ...(patch.deadlineAt !== undefined ? { deadlineAt: patch.deadlineAt ? new Date(patch.deadlineAt) : null } : {}),
    });
    // Raising a limit is how the person answers "keep going": resume at once
    // when nothing is still over a limit.
    if (next.status === "limit_reached") {
      const described = await describe(next);
      if (!evaluateObjectiveLimit(described.limits, described.usage, new Date())) {
        next = await resume(next, actor);
      }
    }
    return describe(next);
  }

  async function resume(row: ObjectiveRow, actor: IssueObjectiveActor) {
    await resumeSubtree(row, actor);
    const next = await updateRow(row.id, {
      status: "active",
      limitReason: null,
      pauseHoldId: null,
      lastNudgeAt: null,
      lastProgressAt: new Date(),
    });
    const locale = await localeFor(row.createdByUserId);
    const comment = await postSystemComment(row.companyId, row.issueId, locale === "es"
      ? "**Objetivo reanudado.** Seguí coordinando desde donde quedó."
      : "**Objective resumed.** Continue coordinating from where it stopped.");
    await wakeCoordinator(next, comment.id, "issue_objective.resume", `issue-objective-resume:${row.id}:${Date.now()}`);
    return next;
  }

  async function act(companyId: string, issueId: string, action: IssueObjectiveAction, actor: IssueObjectiveActor) {
    const row = await getRow(companyId, issueId);
    if (!row) throw notFound("Objective not found");
    const status = row.status as IssueObjectiveStatus;
    const locale = await localeFor(row.createdByUserId);
    if (action === "pause") {
      if (status !== "active") throw conflict("Only an active objective can be paused");
      const holdId = await pauseSubtree(row, "Objective paused", actor);
      await updateRow(row.id, { status: "paused", pauseHoldId: holdId });
      await postSystemComment(companyId, issueId, locale === "es" ? "**Objetivo pausado** por una persona." : "**Objective paused** by a person.");
    } else if (action === "resume") {
      if (status !== "paused" && status !== "limit_reached") throw conflict("Only a paused objective can be resumed");
      const described = await describe(row);
      if (evaluateObjectiveLimit(described.limits, described.usage, new Date())) {
        throw unprocessable("A limit is still reached. Raise it before resuming.");
      }
      await resume(row, actor);
    } else {
      if (!OPEN_STATUSES.includes(status)) throw conflict("This objective has already ended");
      const holdId = row.pauseHoldId ?? await pauseSubtree(row, "Objective stopped", actor);
      await updateRow(row.id, { status: "stopped", pauseHoldId: holdId, endedAt: new Date() });
      await postSystemComment(companyId, issueId, locale === "es"
        ? "**Objetivo frenado.** El trabajo de esta tarea y sus subtareas quedó en pausa. Se puede reanudar tarea por tarea."
        : "**Objective stopped.** Work on this task and its subtasks is paused. Tasks can be resumed one by one.");
    }
    return get(companyId, issueId);
  }

  async function checkObjective(row: ObjectiveRow, now: Date) {
    const root = await db
      .select({ id: issues.id, status: issues.status })
      .from(issues)
      .where(and(eq(issues.id, row.issueId), eq(issues.companyId, row.companyId)))
      .then((rows) => rows[0] ?? null);
    if (!root || root.status === "cancelled") {
      await updateRow(row.id, { status: "stopped", endedAt: now, lastCheckAt: now });
      return "finished" as const;
    }
    // The coordinator alone decides when the objective is met: closing the
    // root task is that decision.
    if (root.status === "done") {
      await updateRow(row.id, { status: "achieved", endedAt: now, lastCheckAt: now });
      return "finished" as const;
    }

    const tree = await loadTree(row);
    const usage = await loadUsage(row.companyId, tree.map((issue) => issue.id), row.startedAt);
    const limits = limitsOf(row);
    const limitReason = evaluateObjectiveLimit(limits, usage, now);
    if (limitReason) {
      const holdId = await pauseSubtree(row, `Objective ${limitReason} limit reached`, { userId: null });
      await updateRow(row.id, { status: "limit_reached", limitReason, pauseHoldId: holdId, lastCheckAt: now });
      const locale = await localeFor(row.createdByUserId);
      await postSystemComment(row.companyId, row.issueId, renderLimitReached(locale, limitReason, limits, usage, now));
      return "limited" as const;
    }

    const progress = summarizeObjectiveTree(row.issueId, tree, now);
    const fingerprint = createHash("sha256").update(objectiveProgressFingerprint(tree)).digest("hex");
    const changed = row.lastProgressFingerprint !== null && row.lastProgressFingerprint !== fingerprint;
    const lastProgressAt = changed ? now : (row.lastProgressAt ?? row.startedAt);
    const reason = decideObjectiveNudge({
      now,
      lastNudgeAt: iso(row.lastNudgeAt),
      lastProgressAt: lastProgressAt.toISOString(),
      fingerprintChanged: changed,
      coordinatorBusy: await coordinatorBusy(row.companyId, row.coordinatorAgentId),
      progress,
    });
    const patch: Partial<typeof issueObjectives.$inferInsert> = {
      lastCheckAt: now,
      lastProgressFingerprint: fingerprint,
      lastProgressAt,
    };
    if (reason) {
      const locale = await localeFor(row.createdByUserId);
      const comment = await postSystemComment(row.companyId, row.issueId, renderObjectiveDigest({ locale, reason, progress, limits, usage, now }));
      // The digest comment itself changes the root's comment count; record the
      // fingerprint after it so the coordinator is not re-nudged by our own note.
      const after = await loadTree(row);
      patch.lastProgressFingerprint = createHash("sha256").update(objectiveProgressFingerprint(after)).digest("hex");
      patch.lastNudgeAt = now;
      patch.nudgeCount = row.nudgeCount + 1;
      await updateRow(row.id, patch);
      await wakeCoordinator(row, comment.id, "issue_objective.check", `issue-objective-check:${row.id}:${now.toISOString()}`);
      return "nudged" as const;
    }
    await updateRow(row.id, patch);
    return "checked" as const;
  }

  async function reconcile(opts: { now?: Date; companyId?: string | null; limit?: number } = {}) {
    const now = opts.now ?? new Date();
    const due = await db
      .select()
      .from(issueObjectives)
      .where(and(
        eq(issueObjectives.status, "active"),
        ...(opts.companyId ? [eq(issueObjectives.companyId, opts.companyId)] : []),
        or(isNull(issueObjectives.lastCheckAt), lt(issueObjectives.lastCheckAt, new Date(now.getTime() - RECHECK_MS))),
      ))
      .limit(opts.limit ?? 100);
    const result = { checked: 0, nudged: 0, limited: 0, finished: 0, failed: 0 };
    for (const row of due) {
      try {
        const outcome = await checkObjective(row, now);
        result.checked += 1;
        if (outcome === "nudged") result.nudged += 1;
        if (outcome === "limited") result.limited += 1;
        if (outcome === "finished") result.finished += 1;
      } catch (err) {
        result.failed += 1;
        logger.error({ err, objectiveId: row.id, issueId: row.issueId }, "objective check failed");
      }
    }
    return result;
  }

  return { get, create, update, act, reconcile, checkObjective };
}
