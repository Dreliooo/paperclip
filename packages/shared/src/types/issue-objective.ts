export const ISSUE_OBJECTIVE_STATUSES = ["active", "paused", "limit_reached", "achieved", "stopped"] as const;
export type IssueObjectiveStatus = (typeof ISSUE_OBJECTIVE_STATUSES)[number];

/** Which agreed limit stopped the objective. */
export type IssueObjectiveLimitReason = "spend" | "tokens" | "deadline";

export const ISSUE_OBJECTIVE_ACTIONS = ["pause", "resume", "stop"] as const;
export type IssueObjectiveAction = (typeof ISSUE_OBJECTIVE_ACTIONS)[number];

export interface IssueObjectiveLimits {
  /** Billed cost cap for the whole subtree, in cents. Null means no cap. */
  maxSpendCents: number | null;
  /** Token cap (input + cached input + output) for the whole subtree. */
  maxTokens: number | null;
  deadlineAt: string | null;
}

export interface IssueObjectiveUsage {
  spentCents: number;
  tokens: number;
}

export interface IssueObjectiveStalledTask {
  issueId: string;
  identifier: string | null;
  title: string;
  assigneeAgentId: string | null;
  idleMinutes: number;
}

export interface IssueObjectiveProgress {
  /** Subtasks below the root task (the root itself is not counted). */
  totalTasks: number;
  doneTasks: number;
  activeTasks: number;
  blockedTasks: number;
  waitingTasks: number;
  cancelledTasks: number;
  stalledTasks: IssueObjectiveStalledTask[];
  activeRuns: number;
}

export interface IssueObjective {
  id: string;
  companyId: string;
  issueId: string;
  objective: string;
  successCriteria: string[];
  coordinatorAgentId: string;
  status: IssueObjectiveStatus;
  limits: IssueObjectiveLimits;
  limitReason: IssueObjectiveLimitReason | null;
  startedAt: string;
  endedAt: string | null;
  lastCheckAt: string | null;
  lastNudgeAt: string | null;
  nudgeCount: number;
  createdByUserId: string | null;
  usage: IssueObjectiveUsage;
  progress: IssueObjectiveProgress;
  createdAt: string;
  updatedAt: string;
}
