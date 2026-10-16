import type {
  IssueObjectiveLimitReason,
  IssueObjectiveLimits,
  IssueObjectiveProgress,
  IssueObjectiveUsage,
} from "./types/issue-objective.js";

/**
 * Pure rules behind objective mode. The server owns persistence and side
 * effects; these functions decide what the supervisor should do so the policy
 * stays small, explicit and testable.
 */

/** A subtask counts as stalled after this long with no activity and no run. */
export const OBJECTIVE_STALL_MS = 45 * 60_000;
/** The coordinator is never nudged more often than this. */
export const OBJECTIVE_MIN_NUDGE_INTERVAL_MS = 10 * 60_000;
/** With nothing changing anywhere, the coordinator gets a check-in this often. */
export const OBJECTIVE_IDLE_CHECK_IN_MS = 2 * 60 * 60_000;

export function evaluateObjectiveLimit(
  limits: IssueObjectiveLimits,
  usage: IssueObjectiveUsage,
  now: Date,
): IssueObjectiveLimitReason | null {
  if (limits.deadlineAt && now.getTime() >= Date.parse(limits.deadlineAt)) return "deadline";
  if (limits.maxSpendCents !== null && usage.spentCents >= limits.maxSpendCents) return "spend";
  if (limits.maxTokens !== null && usage.tokens >= limits.maxTokens) return "tokens";
  return null;
}

export interface ObjectiveTreeRow {
  id: string;
  parentId: string | null;
  identifier: string | null;
  title: string;
  status: string;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  /** Latest of the task's update, last comment and last run activity. */
  lastActivityAt: string;
  commentCount: number;
  hasActiveRun: boolean;
}

const ACTIVE_STATUSES = new Set(["in_progress", "in_review"]);
const WAITING_STATUSES = new Set(["backlog", "todo"]);

export function summarizeObjectiveTree(
  rootId: string,
  rows: ObjectiveTreeRow[],
  now: Date,
  stallMs = OBJECTIVE_STALL_MS,
): IssueObjectiveProgress {
  const progress: IssueObjectiveProgress = {
    totalTasks: 0,
    doneTasks: 0,
    activeTasks: 0,
    blockedTasks: 0,
    waitingTasks: 0,
    cancelledTasks: 0,
    stalledTasks: [],
    activeRuns: 0,
  };
  for (const row of rows) {
    if (row.hasActiveRun) progress.activeRuns += 1;
    if (row.id === rootId) continue;
    progress.totalTasks += 1;
    if (row.status === "done") progress.doneTasks += 1;
    else if (row.status === "cancelled") progress.cancelledTasks += 1;
    else if (row.status === "blocked") progress.blockedTasks += 1;
    else if (ACTIVE_STATUSES.has(row.status)) progress.activeTasks += 1;
    else if (WAITING_STATUSES.has(row.status)) progress.waitingTasks += 1;

    const open = row.status !== "done" && row.status !== "cancelled" && row.status !== "backlog";
    const idleMs = now.getTime() - Date.parse(row.lastActivityAt);
    if (open && row.assigneeAgentId && !row.hasActiveRun && idleMs >= stallMs) {
      progress.stalledTasks.push({
        issueId: row.id,
        identifier: row.identifier,
        title: row.title,
        assigneeAgentId: row.assigneeAgentId,
        idleMinutes: Math.floor(idleMs / 60_000),
      });
    }
  }
  progress.stalledTasks.sort((left, right) => right.idleMinutes - left.idleMinutes);
  return progress;
}

/**
 * A stable description of the subtree's observable state. When it changes
 * between two checks, something happened that the coordinator should hear
 * about (a subtask finished, got blocked, got a reply, or was added).
 */
export function objectiveProgressFingerprint(rows: ObjectiveTreeRow[]): string {
  return rows
    .map((row) => `${row.id}:${row.status}:${row.commentCount}:${row.assigneeAgentId ?? row.assigneeUserId ?? "-"}`)
    .sort()
    .join("|");
}

export type ObjectiveNudgeReason = "progress" | "stalled" | "idle";

export function decideObjectiveNudge(input: {
  now: Date;
  lastNudgeAt: string | null;
  lastProgressAt: string | null;
  fingerprintChanged: boolean;
  coordinatorBusy: boolean;
  progress: IssueObjectiveProgress;
  minIntervalMs?: number;
  idleCheckInMs?: number;
}): ObjectiveNudgeReason | null {
  // A coordinator that is already running (or queued) reads the latest state
  // itself; waking it again would only duplicate work.
  if (input.coordinatorBusy) return null;
  const now = input.now.getTime();
  const minInterval = input.minIntervalMs ?? OBJECTIVE_MIN_NUDGE_INTERVAL_MS;
  if (input.lastNudgeAt && now - Date.parse(input.lastNudgeAt) < minInterval) return null;
  if (input.fingerprintChanged) return "progress";
  if (input.progress.stalledTasks.length > 0) {
    // Repeat a stall reminder only after the idle window, not every interval.
    const sinceNudge = input.lastNudgeAt ? now - Date.parse(input.lastNudgeAt) : Number.POSITIVE_INFINITY;
    if (sinceNudge >= (input.idleCheckInMs ?? OBJECTIVE_IDLE_CHECK_IN_MS) || !input.lastNudgeAt) return "stalled";
    return null;
  }
  const lastMovement = Math.max(
    input.lastProgressAt ? Date.parse(input.lastProgressAt) : 0,
    input.lastNudgeAt ? Date.parse(input.lastNudgeAt) : 0,
  );
  if (input.progress.activeRuns === 0 && now - lastMovement >= (input.idleCheckInMs ?? OBJECTIVE_IDLE_CHECK_IN_MS)) {
    return "idle";
  }
  return null;
}
