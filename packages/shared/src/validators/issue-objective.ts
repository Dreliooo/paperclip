import { z } from "zod";
import { ISSUE_OBJECTIVE_ACTIONS } from "../types/issue-objective.js";

export const ISSUE_OBJECTIVE_MAX_CHARS = 4_000;
export const ISSUE_OBJECTIVE_MAX_CRITERIA = 20;

const criterionSchema = z.string().trim().min(1).max(300);
const limitCentsSchema = z.number().int().positive().max(100_000_000).nullable();
const limitTokensSchema = z.number().int().positive().max(1_000_000_000_000).nullable();
const deadlineSchema = z.string().datetime({ offset: true }).nullable();

export const createIssueObjectiveSchema = z.object({
  objective: z.string().trim().min(1).max(ISSUE_OBJECTIVE_MAX_CHARS),
  successCriteria: z.array(criterionSchema).max(ISSUE_OBJECTIVE_MAX_CRITERIA).default([]),
  coordinatorAgentId: z.string().guid(),
  maxSpendCents: limitCentsSchema.optional().default(null),
  maxTokens: limitTokensSchema.optional().default(null),
  deadlineAt: deadlineSchema.optional().default(null),
}).strict();

export const updateIssueObjectiveSchema = z.object({
  objective: z.string().trim().min(1).max(ISSUE_OBJECTIVE_MAX_CHARS).optional(),
  successCriteria: z.array(criterionSchema).max(ISSUE_OBJECTIVE_MAX_CRITERIA).optional(),
  maxSpendCents: limitCentsSchema.optional(),
  maxTokens: limitTokensSchema.optional(),
  deadlineAt: deadlineSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one objective field is required",
});

export const issueObjectiveActionSchema = z.object({
  action: z.enum(ISSUE_OBJECTIVE_ACTIONS),
}).strict();

export type CreateIssueObjective = z.infer<typeof createIssueObjectiveSchema>;
export type UpdateIssueObjective = z.infer<typeof updateIssueObjectiveSchema>;
export type IssueObjectiveActionRequest = z.infer<typeof issueObjectiveActionSchema>;
