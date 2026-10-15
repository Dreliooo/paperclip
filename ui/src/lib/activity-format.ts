import type { Agent } from "@paperclipai/shared";
import type { CompanyUserProfile } from "./company-members";
import { formatReviewPolicyValue } from "./review-policy";
import { t } from "@/i18n";

type ActivityDetails = Record<string, unknown> | null | undefined;

type ActivityParticipant = {
  type: "agent" | "user";
  agentId?: string | null;
  userId?: string | null;
};

type ActivityIssueReference = {
  id?: string | null;
  identifier?: string | null;
  title?: string | null;
};

interface ActivityFormatOptions {
  agentMap?: Map<string, Agent>;
  userProfileMap?: Map<string, CompanyUserProfile>;
  currentUserId?: string | null;
}

const ACTIVITY_ROW_VERBS: Record<string, string> = {
  get "issue.created"() { return t("ui3lib.activityFormat.row.issue_created"); },
  get "issue.updated"() { return t("ui3lib.activityFormat.row.issue_updated"); },
  get "issue.read_marked"() { return t("ui3lib.activityFormat.row.issue_read_marked"); },
  get "issue.read_unmarked"() { return t("ui3lib.activityFormat.row.issue_read_unmarked"); },
  get "issue.checked_out"() { return t("ui3lib.activityFormat.row.issue_checked_out"); },
  get "issue.released"() { return t("ui3lib.activityFormat.row.issue_released"); },
  get "issue.comment_added"() { return t("ui3lib.activityFormat.row.issue_comment_added"); },
  get "issue.comment_cancelled"() { return t("ui3lib.activityFormat.row.issue_comment_cancelled"); },
  get "issue.queued_comment_edited"() { return t("ui3lib.activityFormat.row.issue_queued_comment_edited"); },
  get "issue.queued_comments_reordered"() { return t("ui3lib.activityFormat.row.issue_queued_comments_reordered"); },
  get "issue.queued_comment_discarded"() { return t("ui3lib.activityFormat.row.issue_queued_comment_discarded"); },
  get "issue.comment_deleted"() { return t("ui3lib.activityFormat.row.issue_comment_deleted"); },
  get "issue.attachment_added"() { return t("ui3lib.activityFormat.row.issue_attachment_added"); },
  get "issue.attachment_removed"() { return t("ui3lib.activityFormat.row.issue_attachment_removed"); },
  get "issue.document_created"() { return t("ui3lib.activityFormat.row.issue_document_created"); },
  get "issue.document_updated"() { return t("ui3lib.activityFormat.row.issue_document_updated"); },
  get "issue.document_locked"() { return t("ui3lib.activityFormat.row.issue_document_locked"); },
  get "issue.document_unlocked"() { return t("ui3lib.activityFormat.row.issue_document_unlocked"); },
  get "issue.document_deleted"() { return t("ui3lib.activityFormat.row.issue_document_deleted"); },
  get "issue.monitor_scheduled"() { return t("ui3lib.activityFormat.row.issue_monitor_scheduled"); },
  get "issue.monitor_triggered"() { return t("ui3lib.activityFormat.row.issue_monitor_triggered"); },
  get "issue.monitor_cleared"() { return t("ui3lib.activityFormat.row.issue_monitor_cleared"); },
  get "issue.monitor_skipped"() { return t("ui3lib.activityFormat.row.issue_monitor_skipped"); },
  get "issue.monitor_exhausted"() { return t("ui3lib.activityFormat.row.issue_monitor_exhausted"); },
  get "issue.monitor_recovery_wake_queued"() { return t("ui3lib.activityFormat.row.issue_monitor_recovery_wake_queued"); },
  get "issue.monitor_recovery_issue_created"() { return t("ui3lib.activityFormat.row.issue_monitor_recovery_issue_created"); },
  get "issue.monitor_escalated_to_board"() { return t("ui3lib.activityFormat.row.issue_monitor_escalated_to_board"); },
  get "issue.commented"() { return t("ui3lib.activityFormat.row.issue_commented"); },
  get "issue.deleted"() { return t("ui3lib.activityFormat.row.issue_deleted"); },
  get "issue.successful_run_handoff_required"() { return t("ui3lib.activityFormat.row.issue_successful_run_handoff_required"); },
  get "issue.successful_run_handoff_resolved"() { return t("ui3lib.activityFormat.row.issue_successful_run_handoff_resolved"); },
  get "issue.successful_run_handoff_escalated"() { return t("ui3lib.activityFormat.row.issue_successful_run_handoff_escalated"); },
  get "issue.accepted_plan_decomposition_updated"() { return t("ui3lib.activityFormat.row.issue_accepted_plan_decomposition_updated"); },
  get "issue.recovery_action_opened"() { return t("ui3lib.activityFormat.row.issue_recovery_action_opened"); },
  get "issue.recovery_action_resolved"() { return t("ui3lib.activityFormat.row.issue_recovery_action_resolved"); },
  get "issue.recovery_action_escalated"() { return t("ui3lib.activityFormat.row.issue_recovery_action_escalated"); },
  get "agent.created"() { return t("ui3lib.activityFormat.row.agent_created"); },
  get "agent.updated"() { return t("ui3lib.activityFormat.row.agent_updated"); },
  get "agent.paused"() { return t("ui3lib.activityFormat.row.agent_paused"); },
  get "agent.resumed"() { return t("ui3lib.activityFormat.row.agent_resumed"); },
  get "agent.error_cleared"() { return t("ui3lib.activityFormat.row.agent_error_cleared"); },
  get "agent.terminated"() { return t("ui3lib.activityFormat.row.agent_terminated"); },
  get "agent.key_created"() { return t("ui3lib.activityFormat.row.agent_key_created"); },
  get "agent.budget_updated"() { return t("ui3lib.activityFormat.row.agent_budget_updated"); },
  get "agent.runtime_session_reset"() { return t("ui3lib.activityFormat.row.agent_runtime_session_reset"); },
  get "heartbeat.invoked"() { return t("ui3lib.activityFormat.row.heartbeat_invoked"); },
  get "heartbeat.cancelled"() { return t("ui3lib.activityFormat.row.heartbeat_cancelled"); },
  get "heartbeat.output_stale_source_resolved"() { return t("ui3lib.activityFormat.row.heartbeat_output_stale_source_resolved"); },
  get "heartbeat.output_stale_recovery_recursion_refused"() { return t("ui3lib.activityFormat.row.heartbeat_output_stale_recovery_recursion_refused"); },
  get "approval.created"() { return t("ui3lib.activityFormat.row.approval_created"); },
  get "approval.approved"() { return t("ui3lib.activityFormat.row.approval_approved"); },
  get "approval.rejected"() { return t("ui3lib.activityFormat.row.approval_rejected"); },
  // Interaction outcomes (PAP-16506). An agent may now resolve one — including a
  // review of its own work — so these must read as outcomes in the feed instead
  // of falling through to the raw "issue thread interaction accepted" action id.
  // `details.interactionKind` sharpens the wording; see INTERACTION_OUTCOME_LABELS.
  get "issue.thread_interaction_created"() { return t("ui3lib.activityFormat.row.issue_thread_interaction_created"); },
  get "issue.thread_interaction_accepted"() { return t("ui3lib.activityFormat.row.issue_thread_interaction_accepted"); },
  get "issue.thread_interaction_rejected"() { return t("ui3lib.activityFormat.row.issue_thread_interaction_rejected"); },
  get "issue.thread_interaction_answered"() { return t("ui3lib.activityFormat.row.issue_thread_interaction_answered"); },
  get "issue.thread_interaction_withdrawn"() { return t("ui3lib.activityFormat.row.issue_thread_interaction_withdrawn"); },
  get "issue.thread_interaction_cancelled"() { return t("ui3lib.activityFormat.row.issue_thread_interaction_cancelled"); },
  get "issue.thread_interaction_skipped"() { return t("ui3lib.activityFormat.row.issue_thread_interaction_skipped"); },
  get "issue.thread_interaction_expired"() { return t("ui3lib.activityFormat.row.issue_thread_interaction_expired"); },
  get "issue.thread_interaction_item_verdicts_submitted"() { return t("ui3lib.activityFormat.row.issue_thread_interaction_item_verdicts_submitted"); },
  get "issue.stalled_review_decided"() { return t("ui3lib.activityFormat.row.issue_stalled_review_decided"); },
  get "project.created"() { return t("ui3lib.activityFormat.row.project_created"); },
  get "project.updated"() { return t("ui3lib.activityFormat.row.project_updated"); },
  get "project.deleted"() { return t("ui3lib.activityFormat.row.project_deleted"); },
  get "goal.created"() { return t("ui3lib.activityFormat.row.goal_created"); },
  get "goal.updated"() { return t("ui3lib.activityFormat.row.goal_updated"); },
  get "goal.deleted"() { return t("ui3lib.activityFormat.row.goal_deleted"); },
  get "cost.reported"() { return t("ui3lib.activityFormat.row.cost_reported"); },
  get "cost.recorded"() { return t("ui3lib.activityFormat.row.cost_recorded"); },
  get "company.created"() { return t("ui3lib.activityFormat.row.company_created"); },
  get "company.updated"() { return t("ui3lib.activityFormat.row.company_updated"); },
  get "company.archived"() { return t("ui3lib.activityFormat.row.company_archived"); },
  get "company.reactivated"() { return t("ui3lib.activityFormat.row.company_reactivated"); },
  get "company.budget_updated"() { return t("ui3lib.activityFormat.row.company_budget_updated"); },
  get "audit.exported"() { return t("ui3lib.activityFormat.row.audit_exported"); },
  get "tool_app.connected"() { return t("ui3lib.activityFormat.row.tool_app_connected"); },
  get "tool_app.oauth_connected"() { return t("ui3lib.activityFormat.row.tool_app_oauth_connected"); },
  get "tool_app.oauth_failed"() { return t("ui3lib.activityFormat.row.tool_app_oauth_failed"); },
  get "tool_app.oauth_access_finalized"() { return t("ui3lib.activityFormat.row.tool_app_oauth_access_finalized"); },
  get "tool_app.finished"() { return t("ui3lib.activityFormat.row.tool_app_finished"); },
  get "tool_app.reconnected"() { return t("ui3lib.activityFormat.row.tool_app_reconnected"); },
  get "tool_connection.created"() { return t("ui3lib.activityFormat.row.tool_connection_created"); },
  get "tool_connection.updated"() { return t("ui3lib.activityFormat.row.tool_connection_updated"); },
  get "tool_connection.archived"() { return t("ui3lib.activityFormat.row.tool_connection_archived"); },
  get "tool_connection.catalog_refresh"() { return t("ui3lib.activityFormat.row.tool_connection_catalog_refresh"); },
  get "tool_connection.installs_synced"() { return t("ui3lib.activityFormat.row.tool_connection_installs_synced"); },
  get "tool_connection.install_access_extended"() { return t("ui3lib.activityFormat.row.tool_connection_install_access_extended"); },
  get "tool_connection.grant_audience_replaced"() { return t("ui3lib.activityFormat.row.tool_connection_grant_audience_replaced"); },
  get "tool_connection.grant_added"() { return t("ui3lib.activityFormat.row.tool_connection_grant_added"); },
  get "tool_connection.grant_revoked"() { return t("ui3lib.activityFormat.row.tool_connection_grant_revoked"); },
  get "tool_connection.grant_delegated"() { return t("ui3lib.activityFormat.row.tool_connection_grant_delegated"); },
  get "tool_connection.grant_delegation_revoked"() { return t("ui3lib.activityFormat.row.tool_connection_grant_delegation_revoked"); },
};

const ISSUE_ACTIVITY_LABELS: Record<string, string> = {
  get "issue.created"() { return t("ui3lib.activityFormat.issue.issue_created"); },
  get "issue.updated"() { return t("ui3lib.activityFormat.issue.issue_updated"); },
  get "issue.checked_out"() { return t("ui3lib.activityFormat.issue.issue_checked_out"); },
  get "issue.released"() { return t("ui3lib.activityFormat.issue.issue_released"); },
  get "issue.comment_added"() { return t("ui3lib.activityFormat.issue.issue_comment_added"); },
  get "issue.comment_cancelled"() { return t("ui3lib.activityFormat.issue.issue_comment_cancelled"); },
  get "issue.queued_comment_edited"() { return t("ui3lib.activityFormat.issue.issue_queued_comment_edited"); },
  get "issue.queued_comments_reordered"() { return t("ui3lib.activityFormat.issue.issue_queued_comments_reordered"); },
  get "issue.queued_comment_discarded"() { return t("ui3lib.activityFormat.issue.issue_queued_comment_discarded"); },
  get "issue.comment_deleted"() { return t("ui3lib.activityFormat.issue.issue_comment_deleted"); },
  get "issue.feedback_vote_saved"() { return t("ui3lib.activityFormat.issue.issue_feedback_vote_saved"); },
  get "issue.attachment_added"() { return t("ui3lib.activityFormat.issue.issue_attachment_added"); },
  get "issue.attachment_removed"() { return t("ui3lib.activityFormat.issue.issue_attachment_removed"); },
  get "issue.document_created"() { return t("ui3lib.activityFormat.issue.issue_document_created"); },
  get "issue.document_updated"() { return t("ui3lib.activityFormat.issue.issue_document_updated"); },
  get "issue.document_locked"() { return t("ui3lib.activityFormat.issue.issue_document_locked"); },
  get "issue.document_unlocked"() { return t("ui3lib.activityFormat.issue.issue_document_unlocked"); },
  get "issue.document_deleted"() { return t("ui3lib.activityFormat.issue.issue_document_deleted"); },
  get "issue.monitor_scheduled"() { return t("ui3lib.activityFormat.issue.issue_monitor_scheduled"); },
  get "issue.monitor_triggered"() { return t("ui3lib.activityFormat.issue.issue_monitor_triggered"); },
  get "issue.monitor_cleared"() { return t("ui3lib.activityFormat.issue.issue_monitor_cleared"); },
  get "issue.monitor_skipped"() { return t("ui3lib.activityFormat.issue.issue_monitor_skipped"); },
  get "issue.monitor_exhausted"() { return t("ui3lib.activityFormat.issue.issue_monitor_exhausted"); },
  get "issue.monitor_recovery_wake_queued"() { return t("ui3lib.activityFormat.issue.issue_monitor_recovery_wake_queued"); },
  get "issue.monitor_recovery_issue_created"() { return t("ui3lib.activityFormat.issue.issue_monitor_recovery_issue_created"); },
  get "issue.monitor_escalated_to_board"() { return t("ui3lib.activityFormat.issue.issue_monitor_escalated_to_board"); },
  get "issue.deleted"() { return t("ui3lib.activityFormat.issue.issue_deleted"); },
  get "issue.successful_run_handoff_required"() { return t("ui3lib.activityFormat.issue.issue_successful_run_handoff_required"); },
  get "issue.successful_run_handoff_resolved"() { return t("ui3lib.activityFormat.issue.issue_successful_run_handoff_resolved"); },
  get "issue.successful_run_handoff_escalated"() { return t("ui3lib.activityFormat.issue.issue_successful_run_handoff_escalated"); },
  get "issue.cross_issue_influence_cap_rejected"() { return t("ui3lib.activityFormat.issue.issue_cross_issue_influence_cap_rejected"); },
  get "issue.cross_issue_influence_observed"() { return t("ui3lib.activityFormat.issue.issue_cross_issue_influence_observed"); },
  get "issue.attribution_spoof_rejected"() { return t("ui3lib.activityFormat.issue.issue_attribution_spoof_rejected"); },
  get "issue.recovery_action_opened"() { return t("ui3lib.activityFormat.issue.issue_recovery_action_opened"); },
  get "issue.recovery_action_resolved"() { return t("ui3lib.activityFormat.issue.issue_recovery_action_resolved"); },
  get "issue.recovery_action_escalated"() { return t("ui3lib.activityFormat.issue.issue_recovery_action_escalated"); },
  get "issue.accepted_plan_decomposition_updated"() { return t("ui3lib.activityFormat.issue.issue_accepted_plan_decomposition_updated"); },
  get "agent.created"() { return t("ui3lib.activityFormat.issue.agent_created"); },
  get "agent.updated"() { return t("ui3lib.activityFormat.issue.agent_updated"); },
  get "agent.paused"() { return t("ui3lib.activityFormat.issue.agent_paused"); },
  get "agent.resumed"() { return t("ui3lib.activityFormat.issue.agent_resumed"); },
  get "agent.error_cleared"() { return t("ui3lib.activityFormat.issue.agent_error_cleared"); },
  get "agent.terminated"() { return t("ui3lib.activityFormat.issue.agent_terminated"); },
  get "heartbeat.invoked"() { return t("ui3lib.activityFormat.issue.heartbeat_invoked"); },
  get "heartbeat.cancelled"() { return t("ui3lib.activityFormat.issue.heartbeat_cancelled"); },
  get "heartbeat.output_stale_source_resolved"() { return t("ui3lib.activityFormat.issue.heartbeat_output_stale_source_resolved"); },
  get "heartbeat.output_stale_recovery_recursion_refused"() { return t("ui3lib.activityFormat.issue.heartbeat_output_stale_recovery_recursion_refused"); },
  get "approval.created"() { return t("ui3lib.activityFormat.row.approval_created"); },
  get "approval.approved"() { return t("ui3lib.activityFormat.row.approval_approved"); },
  get "approval.rejected"() { return t("ui3lib.activityFormat.row.approval_rejected"); },
  get "issue.thread_interaction_created"() { return t("ui3lib.activityFormat.issue.issue_thread_interaction_created"); },
  get "issue.thread_interaction_accepted"() { return t("ui3lib.activityFormat.issue.issue_thread_interaction_accepted"); },
  get "issue.thread_interaction_rejected"() { return t("ui3lib.activityFormat.issue.issue_thread_interaction_rejected"); },
  get "issue.thread_interaction_answered"() { return t("ui3lib.activityFormat.issue.issue_thread_interaction_answered"); },
  get "issue.thread_interaction_withdrawn"() { return t("ui3lib.activityFormat.issue.issue_thread_interaction_withdrawn"); },
  get "issue.thread_interaction_cancelled"() { return t("ui3lib.activityFormat.issue.issue_thread_interaction_cancelled"); },
  get "issue.thread_interaction_skipped"() { return t("ui3lib.activityFormat.issue.issue_thread_interaction_skipped"); },
  get "issue.thread_interaction_expired"() { return t("ui3lib.activityFormat.issue.issue_thread_interaction_expired"); },
  get "issue.thread_interaction_item_verdicts_submitted"() { return t("ui3lib.activityFormat.issue.issue_thread_interaction_item_verdicts_submitted"); },
  get "issue.stalled_review_decided"() { return t("ui3lib.activityFormat.issue.issue_stalled_review_decided"); },
};

/**
 * `issue.stalled_review_decided` carries the verb the actor chose, so the line
 * names the verdict ("approved the review") rather than the generic action.
 * Mirrors `StalledReviewDecisionAction` in shared.
 */
const STALLED_REVIEW_DECISION_LABELS: Record<string, string> = {
  get approve() { return t("ui3lib.activityFormat.stalledReview.approve"); },
  get request_changes() { return t("ui3lib.activityFormat.stalledReview.requestChanges"); },
  get send_back() { return t("ui3lib.activityFormat.stalledReview.sendBack"); },
};

/**
 * `issue.thread_interaction_accepted` / `_rejected` fire for *every* interaction
 * kind, not only for a review. A task suggestion or a question is accepted, not
 * approved, so the kind on the event picks the verb. Kinds absent from a map
 * keep the neutral "accepted the request" wording from the tables above, which
 * is also the fallback for an event that carries no kind.
 */
const INTERACTION_ACCEPTED_LABELS: Record<string, string> = {
  get request_confirmation() { return t("ui3lib.activityFormat.interactionAccepted.requestConfirmation"); },
  get request_checkbox_confirmation() { return t("ui3lib.activityFormat.interactionAccepted.requestCheckboxConfirmation"); },
  get suggest_tasks() { return t("ui3lib.activityFormat.interactionAccepted.suggestTasks"); },
  get ask_user_questions() { return t("ui3lib.activityFormat.interactionAccepted.askUserQuestions"); },
};

const INTERACTION_REJECTED_LABELS: Record<string, string> = {
  get request_confirmation() { return t("ui3lib.activityFormat.interactionRejected.requestConfirmation"); },
  get request_checkbox_confirmation() { return t("ui3lib.activityFormat.interactionRejected.requestCheckboxConfirmation"); },
  get suggest_tasks() { return t("ui3lib.activityFormat.interactionRejected.suggestTasks"); },
  get ask_user_questions() { return t("ui3lib.activityFormat.interactionRejected.askUserQuestions"); },
};

/**
 * Kind-aware wording for an interaction outcome, or `null` when the tables
 * above already say it well enough.
 */
function formatInteractionOutcomeLabel(action: string, details: ActivityDetails): string | null {
  const table = action === "issue.thread_interaction_accepted"
    ? INTERACTION_ACCEPTED_LABELS
    : action === "issue.thread_interaction_rejected"
      ? INTERACTION_REJECTED_LABELS
      : null;
  if (!table) return null;
  const kind = typeof details?.interactionKind === "string" ? details.interactionKind : null;
  return kind ? table[kind] ?? null : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") return String(value ?? t("ui3lib.activityFormat.none"));
  return value.replace(/_/g, " ");
}

function isActivityParticipant(value: unknown): value is ActivityParticipant {
  const record = asRecord(value);
  if (!record) return false;
  return record.type === "agent" || record.type === "user";
}

function isActivityIssueReference(value: unknown): value is ActivityIssueReference {
  return asRecord(value) !== null;
}

function readParticipants(details: ActivityDetails, key: string): ActivityParticipant[] {
  const value = details?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isActivityParticipant);
}

function readIssueReferences(details: ActivityDetails, key: string): ActivityIssueReference[] {
  const value = details?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isActivityIssueReference);
}

function formatUserLabel(userId: string | null | undefined, options: ActivityFormatOptions = {}): string {
  if (!userId || userId === "local-board") return t("ui3lib.assignees.board");
  if (options.currentUserId && userId === options.currentUserId) return t("ui3lib.assignees.you");
  const profile = options.userProfileMap?.get(userId);
  if (profile) return profile.label;
  return t("ui3lib.activityFormat.userShort", { id: userId.slice(0, 5) });
}

function formatParticipantLabel(participant: ActivityParticipant, options: ActivityFormatOptions): string {
  if (participant.type === "agent") {
    const agentId = participant.agentId ?? "";
    return options.agentMap?.get(agentId)?.name ?? t("ui3lib.activityFormat.agent");
  }
  return formatUserLabel(participant.userId, options);
}

function formatIssueReferenceLabel(reference: ActivityIssueReference): string {
  if (reference.identifier) return reference.identifier;
  if (reference.title) return reference.title;
  if (reference.id) return reference.id.slice(0, 8);
  return t("ui3lib.activityFormat.task");
}

function formatChangedEntityLabel(
  singular: string,
  plural: string,
  labels: string[],
): string {
  if (labels.length <= 0) return plural;
  if (labels.length === 1) return t("ui3lib.activityFormat.entityOne", { singular, label: labels[0] });
  return t("ui3lib.activityFormat.entityCount", { count: labels.length, plural });
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function readStringArrayLength(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((entry) => typeof entry === "string" && entry.length > 0).length;
}

function formatAcceptedPlanDecompositionDetail(details: ActivityDetails): string | null {
  if (!details) return null;
  const status = typeof details.status === "string" ? details.status : null;
  const requested = readNumber(details.requestedChildCount);
  const totalChildren = readStringArrayLength(details.childIssueIds);
  const newlyCreated = readStringArrayLength(details.newlyCreatedChildIssueIds);
  const reused = Math.max(0, totalChildren - newlyCreated);
  const parts: string[] = [];
  if (newlyCreated > 0) parts.push(t("ui3lib.activityFormat.decomposition.createdNew", { count: newlyCreated }));
  if (reused > 0) parts.push(t("ui3lib.activityFormat.decomposition.reusedExisting", { count: reused }));
  if (parts.length === 0 && requested !== null) parts.push(t("ui3lib.activityFormat.decomposition.requested", { count: requested }));
  const summary = parts.length > 0 ? parts.join(", ") : null;
  if (status === "completed" && summary) return t("ui3lib.activityFormat.decomposition.completedWith", { summary });
  if (status === "completed") return t("ui3lib.activityFormat.decomposition.completed");
  if (status === "in_flight" && summary) return t("ui3lib.activityFormat.decomposition.inFlightWith", { summary });
  return summary;
}

function formatIssueUpdatedVerb(details: ActivityDetails): string | null {
  if (!details) return null;
  const previous = asRecord(details._previous) ?? {};
  if (details.status !== undefined) {
    const from = previous.status;
    const to = humanizeValue(details.status === "in_review" && details.externalConversationState === "waiting" ? "idle" : details.status);
    return from
      ? t("ui3lib.activityFormat.statusFromTo", { from: humanizeValue(from), to })
      : t("ui3lib.activityFormat.statusTo", { to });
  }
  if (details.priority !== undefined) {
    const from = previous.priority;
    return from
      ? t("ui3lib.activityFormat.priorityFromTo", { from: humanizeValue(from), to: humanizeValue(details.priority) })
      : t("ui3lib.activityFormat.priorityTo", { to: humanizeValue(details.priority) });
  }
  return null;
}

function formatAssigneeName(details: ActivityDetails, options: ActivityFormatOptions): string | null {
  if (!details) return null;
  const agentId = details.assigneeAgentId;
  const userId = details.assigneeUserId;
  if (typeof agentId === "string" && agentId) {
    return options.agentMap?.get(agentId)?.name ?? t("ui3lib.activityFormat.agent");
  }
  if (typeof userId === "string" && userId) {
    return formatUserLabel(userId, options);
  }
  return null;
}

function formatIssueUpdatedAction(details: ActivityDetails, options: ActivityFormatOptions = {}): string | null {
  if (!details) return null;
  const previous = asRecord(details._previous) ?? {};
  const parts: string[] = [];

  if (details.status !== undefined) {
    const from = previous.status;
    const to = humanizeValue(details.status === "in_review" && details.externalConversationState === "waiting" ? "idle" : details.status);
    parts.push(
      from
        ? t("ui3lib.activityFormat.statusFromToPlain", { from: humanizeValue(from), to })
        : t("ui3lib.activityFormat.statusToPlain", { to }),
    );
  }
  if (details.priority !== undefined) {
    const from = previous.priority;
    parts.push(
      from
        ? t("ui3lib.activityFormat.priorityFromToPlain", { from: humanizeValue(from), to: humanizeValue(details.priority) })
        : t("ui3lib.activityFormat.priorityToPlain", { to: humanizeValue(details.priority) }),
    );
  }
  if (details.assigneeAgentId !== undefined || details.assigneeUserId !== undefined) {
    const assigneeName = formatAssigneeName(details, options);
    parts.push(assigneeName ? t("ui3lib.activityFormat.madeResponsible", { name: assigneeName }) : t("ui3lib.activityFormat.clearedResponsible"));
  }
  if (details.reviewPolicy !== undefined) {
    // `null` is the default ("anyone can approve"), so it must not read as
    // "changed the review policy to none" (PAP-16506).
    parts.push(t("ui3lib.activityFormat.changedApprover", { value: formatReviewPolicyValue(details.reviewPolicy) }));
  }
  if (details.title !== undefined) parts.push(t("ui3lib.activityFormat.updatedTitle"));
  if (details.description !== undefined) parts.push(t("ui3lib.activityFormat.updatedDescription"));

  return parts.length > 0 ? parts.join(", ") : null;
}

function formatStructuredIssueChange(input: {
  action: string;
  details: ActivityDetails;
  options: ActivityFormatOptions;
  forIssueDetail: boolean;
}): string | null {
  const details = input.details;
  if (!details) return null;

  if (input.action === "issue.blockers_updated") {
    const added = readIssueReferences(details, "addedBlockedByIssues").map(formatIssueReferenceLabel);
    const removed = readIssueReferences(details, "removedBlockedByIssues").map(formatIssueReferenceLabel);
    const blocker = t("ui3lib.activityFormat.blocker.singular");
    const blockers = t("ui3lib.activityFormat.blocker.plural");
    if (added.length > 0 && removed.length === 0) {
      const changed = formatChangedEntityLabel(blocker, blockers, added);
      return input.forIssueDetail
        ? t("ui3lib.activityFormat.addedChanged", { changed })
        : t("ui3lib.activityFormat.addedChangedTo", { changed });
    }
    if (removed.length > 0 && added.length === 0) {
      const changed = formatChangedEntityLabel(blocker, blockers, removed);
      return input.forIssueDetail
        ? t("ui3lib.activityFormat.removedChanged", { changed })
        : t("ui3lib.activityFormat.removedChangedFrom", { changed });
    }
    return input.forIssueDetail
      ? t("ui3lib.activityFormat.updatedBlockers")
      : t("ui3lib.activityFormat.updatedBlockersOn");
  }

  if (input.action === "issue.reviewers_updated" || input.action === "issue.approvers_updated") {
    const added = readParticipants(details, "addedParticipants").map((participant) => formatParticipantLabel(participant, input.options));
    const removed = readParticipants(details, "removedParticipants").map((participant) => formatParticipantLabel(participant, input.options));
    const singular = input.action === "issue.reviewers_updated"
      ? t("ui3lib.activityFormat.reviewer.singular")
      : t("ui3lib.activityFormat.approver.singular");
    const plural = input.action === "issue.reviewers_updated"
      ? t("ui3lib.activityFormat.reviewer.plural")
      : t("ui3lib.activityFormat.approver.plural");
    if (added.length > 0 && removed.length === 0) {
      const changed = formatChangedEntityLabel(singular, plural, added);
      return input.forIssueDetail
        ? t("ui3lib.activityFormat.addedChanged", { changed })
        : t("ui3lib.activityFormat.addedChangedTo", { changed });
    }
    if (removed.length > 0 && added.length === 0) {
      const changed = formatChangedEntityLabel(singular, plural, removed);
      return input.forIssueDetail
        ? t("ui3lib.activityFormat.removedChanged", { changed })
        : t("ui3lib.activityFormat.removedChangedFrom", { changed });
    }
    return input.forIssueDetail
      ? t("ui3lib.activityFormat.updatedPlural", { plural })
      : t("ui3lib.activityFormat.updatedPluralOn", { plural });
  }

  return null;
}

export function formatActivityVerb(
  action: string,
  details?: Record<string, unknown> | null,
  options: ActivityFormatOptions = {},
): string {
  if (action.startsWith("tool_gateway.")) {
    const rawTool = typeof details?.tool === "string"
      ? details.tool
      : typeof details?.upstreamToolName === "string"
        ? details.upstreamToolName
        : t("ui3lib.activityFormat.appAction");
    const tool = rawTool.replace(/[._-]+/g, " ");
    const isTest = details?.source === "test";
    if (action === "tool_gateway.call_completed") {
      return isTest
        ? t("ui3lib.activityFormat.toolTested", { tool })
        : t("ui3lib.activityFormat.toolUsed", { tool });
    }
    if (action === "tool_gateway.call_allowed") {
      return isTest
        ? t("ui3lib.activityFormat.toolTestStarted", { tool })
        : t("ui3lib.activityFormat.toolAllowed", { tool });
    }
    if (action === "tool_gateway.call_denied") return t("ui3lib.activityFormat.toolDenied", { tool });
    if (action === "tool_gateway.approval_requested") return t("ui3lib.activityFormat.toolAsked", { tool });
    if (action === "tool_gateway.session_created") return t("ui3lib.activityFormat.toolSessionOpened");
    if (action === "tool_gateway.session_rejected") return t("ui3lib.activityFormat.toolSessionRejected");
    if (action === "tool_gateway.discovery") return t("ui3lib.activityFormat.toolDiscovery");
  }

  if (action === "issue.updated") {
    const issueUpdatedVerb = formatIssueUpdatedVerb(details);
    if (issueUpdatedVerb) return issueUpdatedVerb;
  }

  if (action === "issue.stalled_review_decided") {
    const decision = typeof details?.action === "string" ? details.action : null;
    const label = decision ? STALLED_REVIEW_DECISION_LABELS[decision] : null;
    if (label) return t("ui3lib.activityFormat.withOn", { label });
  }

  const outcomeLabel = formatInteractionOutcomeLabel(action, details);
  if (outcomeLabel) return t("ui3lib.activityFormat.withOn", { label: outcomeLabel });

  const structuredChange = formatStructuredIssueChange({
    action,
    details,
    options,
    forIssueDetail: false,
  });
  if (structuredChange) return structuredChange;

  return ACTIVITY_ROW_VERBS[action] ?? action.replace(/[._]/g, " ");
}

export function formatIssueActivityAction(
  action: string,
  details?: Record<string, unknown> | null,
  options: ActivityFormatOptions = {},
): string {
  if (action === "issue.updated") {
    const issueUpdatedAction = formatIssueUpdatedAction(details, options);
    if (issueUpdatedAction) return issueUpdatedAction;
  }

  const structuredChange = formatStructuredIssueChange({
    action,
    details,
    options,
    forIssueDetail: true,
  });
  if (structuredChange) return structuredChange;

  if (action === "issue.accepted_plan_decomposition_updated") {
    const detail = formatAcceptedPlanDecompositionDetail(details);
    if (detail) return detail;
  }

  if (action === "issue.stalled_review_decided") {
    const decision = typeof details?.action === "string" ? details.action : null;
    const label = decision ? STALLED_REVIEW_DECISION_LABELS[decision] : null;
    if (label) return label;
  }

  const outcomeLabel = formatInteractionOutcomeLabel(action, details);
  if (outcomeLabel) return outcomeLabel;

  if (action.startsWith("issue.monitor_") && details) {
    const serviceName = typeof details.serviceName === "string" && details.serviceName.trim()
      ? details.serviceName.trim()
      : null;
    const base = ISSUE_ACTIVITY_LABELS[action] ?? action.replace(/[._]/g, " ");
    return serviceName ? t("ui3lib.activityFormat.baseForService", { base, service: serviceName }) : base;
  }

  if (
    (
      action === "issue.document_created" ||
      action === "issue.document_updated" ||
      action === "issue.document_locked" ||
      action === "issue.document_unlocked" ||
      action === "issue.document_deleted"
    ) &&
    details
  ) {
    const key = typeof details.key === "string" ? details.key : t("ui3lib.activityFormat.document");
    const title = typeof details.title === "string" && details.title
      ? t("ui3lib.activityFormat.documentTitle", { title: details.title })
      : "";
    return t("ui3lib.activityFormat.documentAction", { label: ISSUE_ACTIVITY_LABELS[action] ?? action, key, title });
  }

  return ISSUE_ACTIVITY_LABELS[action] ?? action.replace(/[._]/g, " ");
}
