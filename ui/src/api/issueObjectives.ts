import type { IssueObjective, IssueObjectiveAction } from "@paperclipai/shared";
import { api } from "./client";

export interface IssueObjectiveDraft {
  objective: string;
  successCriteria: string[];
  coordinatorAgentId: string;
  maxSpendCents: number | null;
  maxTokens: number | null;
  deadlineAt: string | null;
}

export type IssueObjectiveLimitsPatch = Partial<Pick<IssueObjectiveDraft, "maxSpendCents" | "maxTokens" | "deadlineAt">>;

export const issueObjectivesApi = {
  get: (issueId: string) =>
    api.get<{ objective: IssueObjective | null }>(`/issues/${encodeURIComponent(issueId)}/objective`),
  create: (issueId: string, draft: IssueObjectiveDraft) =>
    api.post<{ objective: IssueObjective }>(`/issues/${encodeURIComponent(issueId)}/objective`, draft),
  update: (issueId: string, patch: IssueObjectiveLimitsPatch) =>
    api.patch<{ objective: IssueObjective }>(`/issues/${encodeURIComponent(issueId)}/objective`, patch),
  act: (issueId: string, action: IssueObjectiveAction) =>
    api.post<{ objective: IssueObjective | null }>(`/issues/${encodeURIComponent(issueId)}/objective/actions`, { action }),
};
