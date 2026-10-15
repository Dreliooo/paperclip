import { describe, expect, it } from "vitest";
import type { AttentionItem } from "@paperclipai/shared";
import { attentionContextLink, attentionRequester, describeAttentionOrigin } from "./attention-origin";

function item(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: "row-1",
    companyId: "company-1",
    sourceKind: "issue_thread_interaction",
    subject: {
      kind: "interaction",
      id: "interaction-1",
      companyId: "company-1",
      title: "Which provider should we use?",
      identifier: null,
      status: "pending",
      href: "/DEMO/issues/DEMO-7#interaction-interaction-1",
      metadata: { kind: "ask_user_questions", issueId: "issue-7", createdByAgentId: "agent-1" },
    },
    whyNow: "Question on an issue thread.",
    decisionVerbs: [],
    inlineResolvable: true,
    entryRule: "",
    exitRule: "",
    dedupKey: "interaction:interaction-1",
    dismissalKey: "interaction:interaction-1",
    dismissal: null,
    severity: "medium",
    rank: 0,
    activityAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    relatedIssue: {
      kind: "issue",
      id: "issue-7",
      companyId: "company-1",
      title: "Pick a payment provider",
      identifier: "DEMO-7",
      status: "in_progress",
      href: "/DEMO/issues/DEMO-7",
    },
    project: { id: "project-1", name: "Checkout", urlKey: "checkout", color: null, icon: null },
    workspace: null,
    expiresAt: null,
    ruleKey: null,
    originAgentName: null,
    queues: [],
    shelf: false,
    retentionDays: 30,
    keep: false,
    archivedAt: null,
    retentionVersion: 1,
    decideBy: null,
    decideByAttribution: null,
    snoozedUntil: null,
    detail: null,
    trainingExampleId: null,
    ...overrides,
  };
}

const lookups = {
  agentName: (id: string) => (id === "agent-1" ? "Researcher" : null),
  userName: (id: string) => (id === "user-1" ? "Ada Example" : null),
};

describe("describeAttentionOrigin", () => {
  it("names the requesting agent, task, and project for an interaction", () => {
    const origin = describeAttentionOrigin(item(), lookups);
    expect(origin.requester).toEqual({ kind: "agent", id: "agent-1", name: "Researcher" });
    expect(origin.task).toEqual({ identifier: "DEMO-7", title: "Pick a payment provider", href: "/DEMO/issues/DEMO-7" });
    expect(origin.project).toMatchObject({ name: "Checkout", href: "/projects/checkout" });
    expect(origin.missing).toEqual([]);
  });

  it("links to the triggering comment when the interaction recorded one", () => {
    const row = item({
      subject: {
        ...item().subject,
        metadata: { kind: "ask_user_questions", issueId: "issue-7", createdByAgentId: "agent-1", sourceCommentId: "comment-9" },
      },
    });
    expect(attentionContextLink(row)).toEqual({ kind: "comment", href: "/DEMO/issues/DEMO-7#comment-comment-9" });
  });

  it("falls back to the interaction anchor when no comment is recorded", () => {
    expect(attentionContextLink(item())).toEqual({
      kind: "interaction",
      href: "/DEMO/issues/DEMO-7#interaction-interaction-1",
    });
  });

  it("attributes an interaction created by a person to that person", () => {
    const row = item({
      subject: { ...item().subject, metadata: { kind: "request_confirmation", createdByAgentId: null, createdByUserId: "user-1" } },
    });
    expect(attentionRequester(row, lookups)).toEqual({ kind: "user", id: "user-1", name: "Ada Example" });
  });

  it("reports missing facts instead of inventing them", () => {
    const row = item({
      sourceKind: "decision",
      subject: {
        kind: "decision",
        id: "decision-1",
        companyId: "company-1",
        title: "Ship it?",
        identifier: null,
        status: "open",
        href: "/DEMO/decisions?decisionId=decision-1",
        metadata: { originIssueId: null, originAgentId: "agent-unknown" },
      },
      relatedIssue: null,
      project: null,
    });
    const origin = describeAttentionOrigin(row, lookups);
    expect(origin.requester).toBeNull();
    expect(origin.task).toBeNull();
    expect(origin.project).toBeNull();
    expect(origin.context).toBeNull();
    expect(origin.missing).toEqual(["requester", "task", "context"]);
  });

  it("uses the server-resolved origin agent name for a decision", () => {
    const row = item({
      sourceKind: "decision",
      originAgentName: "Planner",
      subject: { ...item().subject, kind: "decision", metadata: { originIssueId: "issue-7", originAgentId: "agent-2" } },
    });
    expect(attentionRequester(row, lookups)).toEqual({ kind: "agent", id: "agent-2", name: "Planner" });
    expect(attentionContextLink(row)).toEqual({ kind: "task", href: "/DEMO/issues/DEMO-7" });
  });

  it("flags a task without a readable project", () => {
    const origin = describeAttentionOrigin(item({ project: null }), lookups);
    expect(origin.project).toBeNull();
    expect(origin.missing).toEqual(["project"]);
  });

  it("marks budget incidents as automatic", () => {
    const row = item({ sourceKind: "budget_incident", relatedIssue: null, project: null, subject: { ...item().subject, kind: "budget_incident", metadata: {} } });
    expect(attentionRequester(row, lookups)).toEqual({ kind: "system" });
  });

  it("opens the approval page for approvals", () => {
    const row = item({
      sourceKind: "approval",
      subject: {
        kind: "approval",
        id: "approval-1",
        companyId: "company-1",
        title: "Hire agent",
        identifier: null,
        status: "pending",
        href: "/DEMO/approvals/approval-1",
        metadata: { requestedByAgentId: null, requestedByUserId: "user-1" },
      },
    });
    expect(attentionRequester(row, lookups)).toEqual({ kind: "user", id: "user-1", name: "Ada Example" });
    expect(attentionContextLink(row)).toEqual({ kind: "approval", href: "/DEMO/approvals/approval-1" });
  });
});
