/**
 * Builds the leading "where does this task live" breadcrumbs for the task
 * detail header. The trail is derived from the task itself (project and
 * parent task), never from browser history, so a task opened from a direct
 * link still shows the same path:
 *
 *   Project › Parent task › (current task)
 *
 * When a task has no readable project the trail falls back to the navigation
 * source (e.g. "Inbox") or to the general task list, and every label always
 * names the place its link opens.
 */

export interface IssueContextProject {
  id: string;
  name: string;
  href: string;
}

export interface IssueContextParent {
  id: string;
  identifier: string | null;
  title: string;
}

export interface IssueContextFallback {
  label: string;
  href: string;
}

export type IssueContextCrumbKind = "project" | "parent" | "source";

export interface IssueContextCrumb {
  kind: IssueContextCrumbKind;
  label: string;
  href: string;
  identifier?: string;
  /** Stable identity used by the breadcrumb context for diffing. */
  key: string;
}

export interface IssueContextBreadcrumbInput {
  project: IssueContextProject | null;
  /** Immediate parent task, when the current task is a sub-task. */
  parent: IssueContextParent | null;
  /** Used only when the task has no readable project. */
  fallback: IssueContextFallback;
}

export function issueDetailPath(issue: { id: string; identifier: string | null }): string {
  return `/issues/${issue.identifier ?? issue.id}`;
}

export function buildIssueContextBreadcrumbs(input: IssueContextBreadcrumbInput): IssueContextCrumb[] {
  const crumbs: IssueContextCrumb[] = [];
  const projectName = input.project?.name.trim();
  if (input.project && projectName) {
    crumbs.push({
      kind: "project",
      label: projectName,
      href: input.project.href,
      key: `project:${input.project.id}`,
    });
  } else {
    crumbs.push({
      kind: "source",
      label: input.fallback.label,
      href: input.fallback.href,
      key: `source:${input.fallback.href}`,
    });
  }

  if (input.parent) {
    crumbs.push({
      kind: "parent",
      label: input.parent.title.trim() || input.parent.identifier || input.parent.id.slice(0, 8),
      href: issueDetailPath(input.parent),
      ...(input.parent.identifier ? { identifier: input.parent.identifier } : {}),
      key: `parent:${input.parent.id}`,
    });
  }
  return crumbs;
}
