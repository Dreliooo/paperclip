import {
  COMPANY_SEARCH_SORTS,
  type CompanySearchSort,
} from "@paperclipai/shared";
import type { ParsedSearchQuery } from "./search-query-parser";
import { t } from "@/i18n";

/**
 * The issue-scoped filter model for /search. This is the SAME shape the query
 * parser (search-query-parser.ts) and the URL round-trip already use — we build
 * the P2 filter-bar UI directly on top of it rather than inventing a second
 * scheme. `sort` lives alongside the filters but is tracked separately (it is not
 * part of the parser's filter set).
 */
export type SearchFilters = ParsedSearchQuery["filters"];

export const SORT_LABELS: Record<CompanySearchSort, string> = {
  get relevance() { return t("ui3lib.searchFilters.sort.relevance"); },
  get updated() { return t("ui3lib.searchFilters.sort.updated"); },
  get created() { return t("ui3lib.searchFilters.sort.created"); },
  get priority() { return t("ui3lib.searchFilters.sort.priority"); },
};

export const UPDATED_WITHIN_LABELS: Record<string, string> = {
  get "24h"() {
    return t("ui3lib.searchFilters.updatedWithin.last24Hours");
  },
  get "7d"() {
    return t("ui3lib.searchFilters.updatedWithin.last7Days");
  },
  get "30d"() {
    return t("ui3lib.searchFilters.updatedWithin.last30Days");
  },
  get "90d"() {
    return t("ui3lib.searchFilters.updatedWithin.last90Days");
  },
};

export function updatedWithinLabel(value: string): string {
  return UPDATED_WITHIN_LABELS[value] ?? t("ui3lib.searchFilters.updatedUpTo", { value });
}

const SORT_SET = new Set<string>(COMPANY_SEARCH_SORTS);

export function parseSearchSort(params: URLSearchParams): CompanySearchSort {
  const raw = params.get("sort");
  return raw && SORT_SET.has(raw) ? (raw as CompanySearchSort) : "relevance";
}

/** Count active filter *dimensions* (assignee counts once regardless of shape). */
export function countActiveFilters(filters: SearchFilters): number {
  let count = 0;
  if (filters.status?.length) count += 1;
  if (filters.priority?.length) count += 1;
  if (filters.assigneeAgentId !== undefined || filters.assigneeUserId) count += 1;
  if (filters.projectId) count += 1;
  if (filters.labelId) count += 1;
  if (filters.updatedWithin || filters.updatedAfter) count += 1;
  return count;
}

// ---------------------------------------------------------------------------
// Assignee: the UI treats assignee as a single choice, but the wire model splits
// it across assigneeAgentId (string | null) and assigneeUserId (string). These
// helpers translate between a single opaque token and that split representation.
//   "me"          → assigneeUserId = currentUserId
//   "none"        → assigneeAgentId = null (unassigned)
//   "agent:<id>"  → assigneeAgentId
//   "user:<id>"   → assigneeUserId
// ---------------------------------------------------------------------------

export function assigneeToken(filters: SearchFilters, currentUserId: string | null): string | undefined {
  if (filters.assigneeAgentId === null) return "none";
  if (typeof filters.assigneeAgentId === "string") return `agent:${filters.assigneeAgentId}`;
  if (filters.assigneeUserId) {
    return filters.assigneeUserId === currentUserId ? "me" : `user:${filters.assigneeUserId}`;
  }
  return undefined;
}

export function applyAssigneeToken(
  filters: SearchFilters,
  token: string | undefined,
  currentUserId: string | null,
): SearchFilters {
  const next: SearchFilters = { ...filters };
  delete next.assigneeAgentId;
  delete next.assigneeUserId;
  if (!token) return next;
  if (token === "none") {
    next.assigneeAgentId = null;
  } else if (token === "me") {
    if (currentUserId) next.assigneeUserId = currentUserId;
  } else if (token.startsWith("agent:")) {
    next.assigneeAgentId = token.slice("agent:".length);
  } else if (token.startsWith("user:")) {
    next.assigneeUserId = token.slice("user:".length);
  }
  return next;
}

export interface FilterChipLookups {
  agentName: (id: string) => string | undefined;
  userName: (id: string) => string | undefined;
  projectName: (id: string) => string | undefined;
  labelName: (id: string) => string | undefined;
  currentUserId: string | null;
}

export interface FilterChip {
  id: string;
  label: string;
  remove: (filters: SearchFilters) => SearchFilters;
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function assigneeChipLabel(filters: SearchFilters, lookups: FilterChipLookups): string {
  if (filters.assigneeAgentId === null) return t("ui3lib.searchFilters.unassigned");
  if (typeof filters.assigneeAgentId === "string") {
    return lookups.agentName(filters.assigneeAgentId) ?? t("ui3lib.searchFilters.agent");
  }
  if (filters.assigneeUserId) {
    if (filters.assigneeUserId === lookups.currentUserId) return t("ui3lib.searchFilters.me");
    return lookups.userName(filters.assigneeUserId) ?? t("ui3lib.searchFilters.user");
  }
  return t("ui3lib.searchFilters.assignee");
}

/** Removable chip descriptors for the active-filter row. */
export function buildFilterChips(filters: SearchFilters, lookups: FilterChipLookups): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const status of filters.status ?? []) {
    chips.push({
      id: `status:${status}`,
      label: t("ui3lib.searchFilters.chipStatus", { value: humanize(status) }),
      remove: (current) => {
        const next = { ...current };
        const remaining = (current.status ?? []).filter((value) => value !== status);
        if (remaining.length > 0) next.status = remaining;
        else delete next.status;
        return next;
      },
    });
  }
  // PAP-411: priority controls are hidden from the UI, but the priority filter
  // DSL (`priority:high`) stays functional at the data layer per board decision.
  // A priority filter can therefore still enter the query via URL round-trip or
  // typed DSL, so we always render a removable chip for it — otherwise a restored
  // priority filter would silently narrow results with no way to see or clear it.
  for (const priority of filters.priority ?? []) {
    chips.push({
      id: `priority:${priority}`,
      label: t("ui3lib.searchFilters.chipPriority", { value: humanize(priority) }),
      remove: (current) => {
        const next = { ...current };
        const remaining = (current.priority ?? []).filter((value) => value !== priority);
        if (remaining.length > 0) next.priority = remaining;
        else delete next.priority;
        return next;
      },
    });
  }
  if (filters.assigneeAgentId !== undefined || filters.assigneeUserId) {
    chips.push({
      id: "assignee",
      label: t("ui3lib.searchFilters.chipAssignee", { value: assigneeChipLabel(filters, lookups) }),
      remove: (current) => {
        const next = { ...current };
        delete next.assigneeAgentId;
        delete next.assigneeUserId;
        return next;
      },
    });
  }
  if (filters.projectId) {
    chips.push({
      id: "project",
      label: t("ui3lib.searchFilters.chipProject", { value: lookups.projectName(filters.projectId) ?? t("ui3lib.searchFilters.project") }),
      remove: (current) => {
        const next = { ...current };
        delete next.projectId;
        return next;
      },
    });
  }
  if (filters.labelId) {
    chips.push({
      id: "label",
      label: t("ui3lib.searchFilters.chipLabel", { value: lookups.labelName(filters.labelId) ?? t("ui3lib.searchFilters.label") }),
      remove: (current) => {
        const next = { ...current };
        delete next.labelId;
        return next;
      },
    });
  }
  if (filters.updatedWithin) {
    chips.push({
      id: "updated",
      label: t("ui3lib.searchFilters.chipUpdated", { value: updatedWithinLabel(filters.updatedWithin) }),
      remove: (current) => {
        const next = { ...current };
        delete next.updatedWithin;
        delete next.updatedAfter;
        return next;
      },
    });
  }
  return chips;
}

/** Human label for a backend zero-results loosen suggestion. */
export function describeLoosenSuggestion(filterKey: string, values: string[], lookups: FilterChipLookups): string {
  switch (filterKey) {
    case "status":
      return t("ui3lib.searchFilters.chipStatus", { value: values.map(humanize).join(", ") });
    case "priority":
      return t("ui3lib.searchFilters.chipPriority", { value: values.map(humanize).join(", ") });
    case "assigneeAgentId":
      return t("ui3lib.searchFilters.chipAssignee", { value: values.map((id) => lookups.agentName(id) ?? t("ui3lib.searchFilters.agent")).join(", ") });
    case "assigneeUserId":
      return t("ui3lib.searchFilters.chipAssignee", {
        value: values
          .map((id) => (id === lookups.currentUserId ? t("ui3lib.searchFilters.me") : lookups.userName(id) ?? t("ui3lib.searchFilters.user")))
          .join(", "),
      });
    case "projectId":
      return t("ui3lib.searchFilters.chipProject", { value: values.map((id) => lookups.projectName(id) ?? t("ui3lib.searchFilters.project")).join(", ") });
    case "labelId":
      return t("ui3lib.searchFilters.chipLabel", { value: values.map((id) => lookups.labelName(id) ?? t("ui3lib.searchFilters.label")).join(", ") });
    case "updatedWithin":
    case "updatedAfter":
      return t("ui3lib.searchFilters.updatedWindow");
    default:
      return humanize(filterKey);
  }
}

/** Clear the filter dimension a loosen suggestion refers to. */
export function clearFilterDimension(filters: SearchFilters, filterKey: string): SearchFilters {
  const next: SearchFilters = { ...filters };
  switch (filterKey) {
    case "status":
      delete next.status;
      break;
    case "priority":
      delete next.priority;
      break;
    case "assigneeAgentId":
    case "assigneeUserId":
      delete next.assigneeAgentId;
      delete next.assigneeUserId;
      break;
    case "projectId":
      delete next.projectId;
      break;
    case "labelId":
      delete next.labelId;
      break;
    case "updatedWithin":
    case "updatedAfter":
      delete next.updatedWithin;
      delete next.updatedAfter;
      break;
    default:
      break;
  }
  return next;
}
