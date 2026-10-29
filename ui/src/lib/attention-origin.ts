import type { AttentionItem } from "@paperclipai/shared";

/**
 * Origin context for a decision-feed row: who asked, which task/project it
 * belongs to, and the exact place it came from.
 *
 * Everything here is read from data the server already returned for the row,
 * after its read checks (rows on unreadable tasks never reach the client, and
 * `relatedIssue` / `project` are only set when readable). Nothing is inferred:
 * when a fact is absent it is reported as missing instead of guessed.
 */

export type AttentionRequester =
  | { kind: "agent"; id: string | null; name: string }
  | { kind: "user"; id: string; name: string }
  | { kind: "system" };

export type AttentionContextLinkKind = "comment" | "interaction" | "task" | "approval" | "source";

export interface AttentionContextLink {
  kind: AttentionContextLinkKind;
  href: string;
}

export interface AttentionOrigin {
  requester: AttentionRequester | null;
  task: { identifier: string | null; title: string | null; href: string | null } | null;
  project: { id: string; name: string; href: string; color: string | null; icon: string | null } | null;
  context: AttentionContextLink | null;
  missing: Array<"requester" | "task" | "project" | "context">;
}

export interface AttentionOriginLookups {
  agentName?: (agentId: string) => string | null | undefined;
  userName?: (userId: string) => string | null | undefined;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Sources raised by Paperclip itself rather than requested by someone. */
const SYSTEM_SOURCES = new Set<AttentionItem["sourceKind"]>(["budget_alert", "agent_error_alert"]);

function agentRequester(id: string | null, lookups: AttentionOriginLookups, fallbackName?: string | null): AttentionRequester | null {
  const name = (id ? str(lookups.agentName?.(id)) : null) ?? str(fallbackName);
  if (!name) return null;
  return { kind: "agent", id, name };
}

function userRequester(id: string | null, lookups: AttentionOriginLookups): AttentionRequester | null {
  if (!id) return null;
  const name = str(lookups.userName?.(id));
  return name ? { kind: "user", id, name } : null;
}

export function attentionRequester(item: AttentionItem, lookups: AttentionOriginLookups = {}): AttentionRequester | null {
  const meta = item.subject.metadata ?? {};
  switch (item.sourceKind) {
    case "issue_thread_interaction":
      return agentRequester(str(meta.createdByAgentId), lookups, item.resolverAudience?.createdByAgentName)
        ?? userRequester(str(meta.createdByUserId), lookups);
    case "decision":
      return agentRequester(str(meta.originAgentId), lookups, item.originAgentName);
    case "approval":
      return agentRequester(str(meta.requestedByAgentId), lookups)
        ?? userRequester(str(meta.requestedByUserId), lookups);
    default:
      break;
  }
  if (item.detail && (item.detail.kind === "failed_run" || item.detail.kind === "agent_error")) {
    const fromDetail = agentRequester(null, lookups, item.detail.agentName);
    if (fromDetail) return fromDetail;
  }
  const origin = agentRequester(null, lookups, item.originAgentName);
  if (origin) return origin;
  return SYSTEM_SOURCES.has(item.sourceKind) ? { kind: "system" } : null;
}

function stripHash(href: string): string {
  const index = href.indexOf("#");
  return index === -1 ? href : href.slice(0, index);
}

export function attentionContextLink(item: AttentionItem): AttentionContextLink | null {
  const meta = item.subject.metadata ?? {};
  const taskHref = item.relatedIssue?.href ?? (item.subject.kind === "issue" ? item.subject.href : null);
  switch (item.sourceKind) {
    case "issue_thread_interaction": {
      const commentId = str(meta.sourceCommentId);
      const base = taskHref ?? (item.subject.href ? stripHash(item.subject.href) : null);
      if (commentId && base) return { kind: "comment", href: `${stripHash(base)}#comment-${commentId}` };
      return item.subject.href ? { kind: "interaction", href: item.subject.href } : null;
    }
    case "approval":
      // The approval page carries the full payload and its linked tasks.
      return item.subject.href ? { kind: "approval", href: item.subject.href } : null;
    case "decision":
      // The decision row itself is the decision; its origin is the task the
      // agent was working on. No task recorded → no origin to open.
      return taskHref ? { kind: "task", href: taskHref } : null;
    default:
      if (taskHref) return { kind: "task", href: taskHref };
      return item.subject.href ? { kind: "source", href: item.subject.href } : null;
  }
}

export function describeAttentionOrigin(item: AttentionItem, lookups: AttentionOriginLookups = {}): AttentionOrigin {
  const related = item.relatedIssue ?? (item.subject.kind === "issue" ? item.subject : null);
  const task = related
    ? { identifier: related.identifier, title: str(related.title), href: related.href }
    : null;
  const project = item.project && str(item.project.name)
    ? {
        id: item.project.id,
        name: item.project.name,
        href: `/projects/${item.project.urlKey || item.project.id}`,
        color: item.project.color,
        icon: item.project.icon,
      }
    : null;
  const requester = attentionRequester(item, lookups);
  const context = attentionContextLink(item);
  const missing: AttentionOrigin["missing"] = [];
  if (!requester) missing.push("requester");
  if (!task) missing.push("task");
  // A project is only "missing" for work that sits on a task.
  if (task && !project) missing.push("project");
  if (!context) missing.push("context");
  return { requester, task, project, context, missing };
}
