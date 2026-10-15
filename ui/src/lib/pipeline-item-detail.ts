import type { Issue } from "@paperclipai/shared";
import type {
  PipelineCase,
  PipelineCaseActiveWork,
  PipelineCaseDetail,
  PipelineCaseEvent,
  PipelineCaseIssueLinkWithIssue,
  PipelineStage,
} from "../api/pipelines";
import { assigneeValueFromSelection } from "./assignees";
import { t } from "@/i18n";

export const INTERNAL_FIELD_KEYS = new Set([
  "nextSuggestedStageId",
  "suggestionResolution",
  "upstreamDrift",
  "upstreamChanged",
  "changeAcknowledgedAt",
  "thisChanged",
]);

type StageLookup = Map<string, string> | Record<string, string> | PipelineStage[] | undefined;

export interface PipelineChildRow {
  case: PipelineCase;
  stage: PipelineStage;
  activeWork?: PipelineCaseActiveWork | null;
  descendantActiveWorkCount?: number;
}

interface PipelineCaseTreeNode {
  id: string;
  caseKey?: string | null;
  title: string;
  terminalKind?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  pipeline?: { id: string; key?: string; name?: string } | null;
  stage?: { id: string; key: string; name: string; kind: string } | null;
  rollup?: { total?: number | null } | null;
  childGroups?: Array<{ cases?: PipelineCaseTreeNode[] | null }> | null;
}

interface PipelineCaseChildrenTree {
  case?: PipelineCaseTreeNode | null;
  childGroups?: Array<{ cases?: PipelineCaseTreeNode[] | null }> | null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stageNameFromLookup(stages: StageLookup, keyOrId: string | null | undefined) {
  if (!keyOrId) return null;
  if (!stages) return null;
  if (Array.isArray(stages)) {
    const stage = stages.find((candidate) => candidate.key === keyOrId || candidate.id === keyOrId);
    return stage?.name ?? null;
  }
  if (stages instanceof Map) return stages.get(keyOrId) ?? null;
  return stages[keyOrId] ?? null;
}

function humanizeKey(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

export function humanizePipelineItemStatus(status: string | null | undefined) {
  if (!status) return t("ui3lib.pipelineItem.statusOpen");
  const normalized = status.trim().toLowerCase();
  if (!normalized) return t("ui3lib.pipelineItem.statusOpen");
  const labels: Record<string, string> = {
    open: t("ui3lib.pipelineItem.statusOpen"),
    working: t("ui3lib.pipelineItem.statusInProgress"),
    done: t("ui3lib.pipelineItem.statusDone"),
    cancelled: t("ui3lib.pipelineItem.statusRemoved"),
    in_review: t("ui3lib.pipelineItem.statusInReview"),
    review: t("ui3lib.pipelineItem.statusInReview"),
    in_progress: t("ui3lib.pipelineItem.statusInProgress"),
  };
  return labels[normalized] ?? humanizeKey(normalized);
}

export function formatFieldValue(value: unknown): string {
  if (Array.isArray(value)) {
    const formatted = value.map(formatFieldValue).filter(Boolean);
    return formatted.length ? formatted.join(", ") : t("ui3lib.pipelineItem.none");
  }
  if (value == null || value === "") return t("ui3lib.pipelineItem.none");
  if (typeof value === "boolean") return value ? t("ui3lib.pipelineItem.yes") : t("ui3lib.pipelineItem.no");
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  const record = readRecord(value);
  if (record) {
    return readString(record.label) ?? readString(record.name) ?? readString(record.title) ?? t("ui3lib.pipelineItem.addedDetails");
  }
  return String(value);
}

export function displayPipelineItemFields(fields: Record<string, unknown> | null | undefined) {
  return Object.entries(fields ?? {})
    .filter(([key]) => !INTERNAL_FIELD_KEYS.has(key))
    .map(([key, value]) => ({
      key,
      label: humanizeKey(key),
      value: formatFieldValue(value),
    }));
}

export type PipelineItemDisplayField = ReturnType<typeof displayPipelineItemFields>[number];

const LONG_FIELD_CHARACTER_THRESHOLD = 180;

export function isLongPipelineItemField(field: Pick<PipelineItemDisplayField, "value">) {
  const value = field.value.trim();
  if (!value || value === t("ui3lib.pipelineItem.none")) return false;
  return value.includes("\n") || value.length >= LONG_FIELD_CHARACTER_THRESHOLD;
}

export function splitPipelineItemFields(fields: PipelineItemDisplayField[]) {
  const shortFields: PipelineItemDisplayField[] = [];
  const longFields: PipelineItemDisplayField[] = [];
  for (const field of fields) {
    if (isLongPipelineItemField(field)) {
      longFields.push(field);
    } else {
      shortFields.push(field);
    }
  }
  return { shortFields, longFields };
}

type PipelineConversationAssigneeIssue = Pick<
  Issue,
  "id" | "parentId" | "assigneeAgentId" | "assigneeUserId" | "createdByAgentId"
>;

function sourceIssueAssigneeValue(issue: PipelineConversationAssigneeIssue | null | undefined) {
  if (!issue) return "";
  return assigneeValueFromSelection(issue) || assigneeValueFromSelection({ assigneeAgentId: issue.createdByAgentId });
}

export function pipelineConversationStarterAssigneeValue(input: {
  conversationIssue?: PipelineConversationAssigneeIssue | null;
  conversationSource?: PipelineCaseDetail["conversationSource"] | null;
  issueLinks?: PipelineCaseIssueLinkWithIssue[] | null;
}) {
  const conversationIssue = input.conversationIssue ?? null;
  const currentAssigneeValue = assigneeValueFromSelection(conversationIssue ?? {});
  if (currentAssigneeValue) return currentAssigneeValue;

  const source = input.conversationSource;
  if (source?.issue && source.kind !== "explicit_conversation") {
    const sourceAssigneeValue = sourceIssueAssigneeValue(source.issue);
    if (sourceAssigneeValue) return sourceAssigneeValue;
  }

  const sourceLinks = (input.issueLinks ?? [])
    .filter((link) => link.link.role !== "conversation")
    .slice()
    .reverse();
  const parentSource = conversationIssue?.parentId
    ? sourceLinks.find((link) => link.issue.id === conversationIssue.parentId)
    : null;
  const linkedSource = parentSource ?? sourceLinks.find((link) => sourceIssueAssigneeValue(link.issue));
  return sourceIssueAssigneeValue(linkedSource?.issue);
}

function treeNodeToChildRow(node: PipelineCaseTreeNode): PipelineChildRow | null {
  const pipelineId = node.pipeline?.id;
  const stage = node.stage;
  if (!pipelineId || !stage) return null;

  return {
    case: {
      id: node.id,
      pipelineId,
      stageId: stage.id,
      caseKey: node.caseKey ?? null,
      title: node.title,
      fields: {},
      terminalKind: node.terminalKind ?? null,
      childCount:
        node.rollup?.total ??
        node.childGroups?.reduce((count, group) => count + (group.cases?.length ?? 0), 0) ??
        0,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    },
    stage: {
      id: stage.id,
      pipelineId,
      key: stage.key,
      name: stage.name,
      kind: stage.kind,
      position: 0,
    },
  };
}

export function normalizePipelineChildRows(value: unknown): PipelineChildRow[] {
  if (Array.isArray(value)) {
    return value.filter((row): row is PipelineChildRow => {
      const candidate = row as Partial<PipelineChildRow>;
      return Boolean(candidate.case?.id && candidate.case.pipelineId && candidate.stage?.id);
    });
  }

  const tree = readRecord(value) as PipelineCaseChildrenTree | null;
  if (!tree) return [];

  return (tree.childGroups ?? tree.case?.childGroups ?? [])
    .flatMap((group) => group.cases ?? [])
    .map(treeNodeToChildRow)
    .filter((row): row is PipelineChildRow => Boolean(row));
}

export function getPendingTransitionBannerState(item: Pick<PipelineCase, "pendingSuggestion" | "fields">, stages?: StageLookup) {
  const fields = item.fields ?? {};
  if (fields.suggestionResolution || fields.changeAcknowledgedAt) {
    return { visible: false as const, reason: "resolved" as const };
  }
  const suggestion = item.pendingSuggestion ?? null;
  const toStageKey = suggestion?.toStageKey ?? readString(fields.nextSuggestedStageId);
  if (!toStageKey) return { visible: false as const, reason: "no_next_stage" as const };
  return {
    visible: true as const,
    suggestionId: suggestion?.id ?? null,
    toStageKey,
    stageName: stageNameFromLookup(stages, toStageKey) ?? t("ui3lib.pipelineItem.nextStage"),
    rationale: suggestion?.rationale ?? null,
  };
}

export function itemHasChangedNotice(item: Pick<PipelineCase, "fields"> & {
  thisChanged?: unknown;
  changeAcknowledgedAt?: unknown;
}) {
  const fields = item.fields ?? {};
  if (item.changeAcknowledgedAt || fields.changeAcknowledgedAt) return null;
  if (item.thisChanged || fields.thisChanged || fields.upstreamChanged || fields.upstreamDrift) {
    return {
      title: t("ui3lib.pipelineItem.thisChanged"),
      body: t("ui3lib.pipelineItem.upstreamChanged"),
    };
  }
  return null;
}

export function eventsHaveUnacknowledgedDrift(events: PipelineCaseEvent[]) {
  const latestAcknowledgedAt = events
    .filter((event) => event.type === "drift_acknowledged")
    .map((event) => new Date(event.createdAt).getTime())
    .filter((time) => Number.isFinite(time))
    .reduce((latest, time) => Math.max(latest, time), 0);

  return events.some((event) => {
    if (event.type !== "upstream_drift") return false;
    const createdAt = new Date(event.createdAt).getTime();
    return Number.isFinite(createdAt) && createdAt > latestAcknowledgedAt;
  });
}

export function changedNoticeFromEvents(events: PipelineCaseEvent[]) {
  if (!eventsHaveUnacknowledgedDrift(events)) return null;
  return {
    title: t("ui3lib.pipelineItem.thisChanged"),
    body: t("ui3lib.pipelineItem.upstreamChanged"),
  };
}

function stageName(event: PipelineCaseEvent, stages: StageLookup, side: "from" | "to") {
  const enrichedStage = side === "from" ? event.fromStage : event.toStage;
  if (enrichedStage?.name) return enrichedStage.name;
  const stageId = side === "from" ? event.fromStageId : event.toStageId;
  return stageNameFromLookup(stages, stageId ?? undefined);
}

function readDecision(payload: Record<string, unknown>) {
  return readString(payload.decision)?.toLowerCase() ?? null;
}

function actorName(event: PipelineCaseEvent) {
  if (event.actorAgent?.name) return event.actorAgent.name;
  if (event.actorType === "user") return t("ui3lib.pipelineItem.board");
  if (event.actorType === "system") return "Paperclip";
  return null;
}

function movementReason(payload: Record<string, unknown>) {
  const reason = readString(payload.reason);
  if (!reason) return null;
  if (reason === "children_terminal") return t("ui3lib.pipelineItem.allChildItemsDone");
  return reason;
}

function movementClass(event: PipelineCaseEvent, payload: Record<string, unknown>) {
  const raw = readString(payload.transitionClass)?.toLowerCase();
  if (raw === "auto" || raw === "automatic") return "automatic";
  if (event.actorType === "system" && readString(payload.reason) === "children_terminal") return "automatic";
  if (raw === "manual") return "manual";
  return raw;
}

function automationIssueLabel(event: PipelineCaseEvent) {
  const issue = event.automation?.issue;
  if (!issue) return null;
  return issue.identifier ?? issue.title;
}

function humanizeReason(reason: string) {
  return humanizeKey(reason).replace(/^./, (char) => char.toLowerCase());
}

export function formatPipelineItemEvent(event: PipelineCaseEvent, stages?: StageLookup) {
  const kind = event.type.startsWith("case.") ? event.type.slice("case.".length) : event.type;
  const payload = event.payload ?? {};
  if (kind === "ingested") return t("ui3lib.pipelineItem.itemAdded");
  if (kind === "updated") {
    if (payload.action === "stage_automation_rerun_requested") return t("ui3lib.pipelineItem.rerunRequested");
    return t("ui3lib.pipelineItem.detailsUpdated");
  }
  if (kind === "transitioned") {
    const from = stageName(event, stages, "from");
    const to = stageName(event, stages, "to");
    const movement = from && to
      ? t("ui3lib.pipelineItem.movedFromTo", { from, to })
      : to
        ? t("ui3lib.pipelineItem.movedTo", { to })
        : t("ui3lib.pipelineItem.movedToAnotherStage");
    const reason = movementReason(payload);
    const transitionClass = movementClass(event, payload);
    if (transitionClass === "automatic") {
      return t("ui3lib.pipelineItem.transitionAutomatic", {
        movement,
        reasonSuffix: reason ? t("ui3lib.pipelineItem.reasonParen", { reason }) : "",
      });
    }
    const actor = actorName(event);
    if (reason && actor) return t("ui3lib.pipelineItem.transitionActorReason", { movement, actor, reason });
    if (reason) return t("ui3lib.pipelineItem.transitionReason", { movement, reason });
    if (actor && event.actorType !== "system") return t("ui3lib.pipelineItem.transitionActor", { movement, actor });
    return t("ui3lib.pipelineItem.transitionPlain", { movement });
  }
  if (kind === "suggested" || kind === "transition_suggested") {
    const suggestion = readRecord(payload.suggestion);
    const toStageKey = readString(suggestion?.toStageKey) ?? readString(payload.toStageKey);
    const to = stageNameFromLookup(stages, toStageKey) ?? t("ui3lib.pipelineItem.nextStage");
    return t("ui3lib.pipelineItem.suggestedMoving", { to });
  }
  if (kind === "suggestion_resolved") {
    const decision = readDecision(payload);
    if (decision === "accept") return t("ui3lib.pipelineItem.suggestionApproved");
    if (decision === "dismiss") return t("ui3lib.pipelineItem.suggestionDismissed");
    return t("ui3lib.pipelineItem.suggestionResolved");
  }
  if (kind === "reviewed" || kind === "review_decided") {
    const decision = readDecision(payload);
    if (decision === "request_changes") return t("ui3lib.pipelineItem.reviewRequestedChanges");
    if (decision === "drop" || decision === "reject") return t("ui3lib.pipelineItem.reviewRemoved");
    if (decision === "approve") return t("ui3lib.pipelineItem.reviewApproved");
    return t("ui3lib.pipelineItem.reviewCompleted");
  }
  if (kind === "conversation_opened") return t("ui3lib.pipelineItem.conversationStarted");
  if (kind === "issue_linked") return t("ui3lib.pipelineItem.linkedToWork");
  if (kind === "issue_unlinked") return t("ui3lib.pipelineItem.workLinkRemoved");
  if (kind === "blockers_set") return t("ui3lib.pipelineItem.waitingUpdated");
  if (kind === "blockers_resolved") return t("ui3lib.pipelineItem.waitingCleared");
  if (kind === "children_terminal") return t("ui3lib.pipelineItem.builtFromCompleted");
  if (kind === "upstream_drift") {
    const upstreamCaseKey = readString(payload.upstreamCaseKey);
    if (upstreamCaseKey) return t("ui3lib.pipelineItem.upstreamDetectedFrom", { key: upstreamCaseKey });
    return t("ui3lib.pipelineItem.upstreamDetected");
  }
  if (kind === "drift_acknowledged") return t("ui3lib.pipelineItem.upstreamAcknowledged");
  if (kind === "automation_executed") {
    const routineName = event.automation?.routine?.title ?? t("ui3lib.pipelineItem.theAutomation");
    const issueLabel = automationIssueLabel(event);
    return t("ui3lib.pipelineItem.automationCompleted", {
      routine: routineName,
      issueSuffix: issueLabel ? t("ui3lib.pipelineItem.automationIssueSuffix", { issue: issueLabel }) : "",
    });
  }
  if (kind === "automation_failed") {
    const reason = readString(payload.error);
    return t("ui3lib.pipelineItem.automationNeedsAttention", {
      reasonSuffix: reason ? t("ui3lib.pipelineItem.attentionReason", { reason: humanizeReason(reason) }) : "",
    });
  }
  if (kind === "claimed") return t("ui3lib.pipelineItem.workStarted");
  if (kind === "lease_released" || kind === "lease_expired") return t("ui3lib.pipelineItem.workHandoffCleared");
  return t("ui3lib.pipelineItem.activityRecorded");
}
