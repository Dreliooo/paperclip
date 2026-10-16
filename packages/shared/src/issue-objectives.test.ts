import { describe, expect, it } from "vitest";
import {
  decideObjectiveNudge,
  evaluateObjectiveLimit,
  objectiveProgressFingerprint,
  summarizeObjectiveTree,
  type ObjectiveTreeRow,
} from "./issue-objectives.js";
import { createIssueObjectiveSchema } from "./validators/issue-objective.js";

const now = new Date("2026-10-16T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

function row(overrides: Partial<ObjectiveTreeRow>): ObjectiveTreeRow {
  return {
    id: "child",
    parentId: "root",
    identifier: "DEMO-2",
    title: "Child",
    status: "todo",
    assigneeAgentId: "agent-1",
    assigneeUserId: null,
    lastActivityAt: minutesAgo(5),
    commentCount: 0,
    hasActiveRun: false,
    ...overrides,
  };
}

describe("evaluateObjectiveLimit", () => {
  const usage = { spentCents: 500, tokens: 10_000 };

  it("returns null without limits", () => {
    expect(evaluateObjectiveLimit({ maxSpendCents: null, maxTokens: null, deadlineAt: null }, usage, now)).toBeNull();
  });

  it("reports the deadline first, then spend, then tokens", () => {
    expect(evaluateObjectiveLimit({ maxSpendCents: 100, maxTokens: 1, deadlineAt: minutesAgo(1) }, usage, now)).toBe("deadline");
    expect(evaluateObjectiveLimit({ maxSpendCents: 500, maxTokens: 1, deadlineAt: null }, usage, now)).toBe("spend");
    expect(evaluateObjectiveLimit({ maxSpendCents: 501, maxTokens: 10_000, deadlineAt: null }, usage, now)).toBe("tokens");
    expect(evaluateObjectiveLimit({ maxSpendCents: 501, maxTokens: 10_001, deadlineAt: minutesAgo(-30) }, usage, now)).toBeNull();
  });
});

describe("summarizeObjectiveTree", () => {
  it("counts subtasks by state and excludes the root", () => {
    const progress = summarizeObjectiveTree("root", [
      row({ id: "root", parentId: null, status: "in_progress", hasActiveRun: true }),
      row({ id: "a", status: "done" }),
      row({ id: "b", status: "in_progress", hasActiveRun: true }),
      row({ id: "c", status: "blocked" }),
      row({ id: "d", status: "backlog" }),
      row({ id: "e", status: "cancelled" }),
    ], now);
    expect(progress).toMatchObject({
      totalTasks: 5,
      doneTasks: 1,
      activeTasks: 1,
      blockedTasks: 1,
      waitingTasks: 1,
      cancelledTasks: 1,
      activeRuns: 2,
    });
  });

  it("flags open agent tasks that went quiet with no run", () => {
    const progress = summarizeObjectiveTree("root", [
      row({ id: "quiet", lastActivityAt: minutesAgo(90) }),
      row({ id: "quieter", status: "in_progress", lastActivityAt: minutesAgo(200) }),
      row({ id: "running", lastActivityAt: minutesAgo(200), hasActiveRun: true }),
      row({ id: "human", assigneeAgentId: null, assigneeUserId: "u1", lastActivityAt: minutesAgo(200) }),
      row({ id: "parked", status: "backlog", lastActivityAt: minutesAgo(200) }),
      row({ id: "fresh", lastActivityAt: minutesAgo(10) }),
    ], now);
    expect(progress.stalledTasks.map((task) => task.issueId)).toEqual(["quieter", "quiet"]);
    expect(progress.stalledTasks[0]!.idleMinutes).toBe(200);
  });
});

describe("objectiveProgressFingerprint", () => {
  it("changes when a subtask changes state or gets a comment, not on order", () => {
    const base = [row({ id: "a" }), row({ id: "b", status: "in_progress" })];
    expect(objectiveProgressFingerprint(base)).toBe(objectiveProgressFingerprint([...base].reverse()));
    expect(objectiveProgressFingerprint([row({ id: "a", status: "done" }), base[1]!])).not.toBe(objectiveProgressFingerprint(base));
    expect(objectiveProgressFingerprint([row({ id: "a", commentCount: 1 }), base[1]!])).not.toBe(objectiveProgressFingerprint(base));
  });
});

describe("decideObjectiveNudge", () => {
  const quiet = summarizeObjectiveTree("root", [], now);
  const stalled = summarizeObjectiveTree("root", [row({ id: "x", lastActivityAt: minutesAgo(120) })], now);

  it("never wakes a coordinator that is already working", () => {
    expect(decideObjectiveNudge({ now, lastNudgeAt: null, lastProgressAt: null, fingerprintChanged: true, coordinatorBusy: true, progress: stalled })).toBeNull();
  });

  it("reports progress, but not twice within ten minutes", () => {
    expect(decideObjectiveNudge({ now, lastNudgeAt: minutesAgo(30), lastProgressAt: null, fingerprintChanged: true, coordinatorBusy: false, progress: quiet })).toBe("progress");
    expect(decideObjectiveNudge({ now, lastNudgeAt: minutesAgo(3), lastProgressAt: null, fingerprintChanged: true, coordinatorBusy: false, progress: quiet })).toBeNull();
  });

  it("reminds about stalled subtasks once, then every two hours", () => {
    expect(decideObjectiveNudge({ now, lastNudgeAt: null, lastProgressAt: null, fingerprintChanged: false, coordinatorBusy: false, progress: stalled })).toBe("stalled");
    expect(decideObjectiveNudge({ now, lastNudgeAt: minutesAgo(30), lastProgressAt: null, fingerprintChanged: false, coordinatorBusy: false, progress: stalled })).toBeNull();
    expect(decideObjectiveNudge({ now, lastNudgeAt: minutesAgo(121), lastProgressAt: null, fingerprintChanged: false, coordinatorBusy: false, progress: stalled })).toBe("stalled");
  });

  it("checks in when nothing at all moved for two hours", () => {
    expect(decideObjectiveNudge({ now, lastNudgeAt: minutesAgo(130), lastProgressAt: minutesAgo(125), fingerprintChanged: false, coordinatorBusy: false, progress: quiet })).toBe("idle");
    expect(decideObjectiveNudge({ now, lastNudgeAt: minutesAgo(130), lastProgressAt: minutesAgo(20), fingerprintChanged: false, coordinatorBusy: false, progress: quiet })).toBeNull();
  });
});

describe("createIssueObjectiveSchema", () => {
  it("defaults limits to none and trims criteria", () => {
    const parsed = createIssueObjectiveSchema.parse({
      objective: "  Publish the monthly report  ",
      successCriteria: ["  34 reports uploaded "],
      coordinatorAgentId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed).toEqual({
      objective: "Publish the monthly report",
      successCriteria: ["34 reports uploaded"],
      coordinatorAgentId: "11111111-1111-4111-8111-111111111111",
      maxSpendCents: null,
      maxTokens: null,
      deadlineAt: null,
    });
  });

  it("rejects zero or negative limits", () => {
    expect(createIssueObjectiveSchema.safeParse({ objective: "x", coordinatorAgentId: "11111111-1111-4111-8111-111111111111", maxSpendCents: 0 }).success).toBe(false);
  });
});
