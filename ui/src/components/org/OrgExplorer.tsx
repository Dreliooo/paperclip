import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Search, Users, X } from "lucide-react";
import { AGENT_ROLE_LABELS, type Agent } from "@paperclipai/shared";
import { Link, useSearchParams } from "@/lib/router";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrgNode } from "../../api/agents";
import { useTranslation } from "../../i18n";
import {
  ancestorIds,
  defaultExpandedIds,
  directReports,
  indexOrgTree,
  orgPath,
  searchOrg,
  teamStatusSummary,
  visibleOrgRows,
  type OrgIndex,
} from "../../lib/org-explorer";
import { agentStatusDot, agentStatusDotDefault } from "../../lib/status-colors";
import { agentUrl, cn } from "../../lib/utils";
import { AgentStatusBadge } from "../StatusBadge";

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;
/** URL search param holding the focused agent, so a team view is linkable. */
export const ORG_FOCUS_PARAM = "focus";

interface OrgExplorerProps {
  orgTree: OrgNode[];
  agents: Agent[];
}

function StatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", agentStatusDot[status] ?? agentStatusDotDefault, className)}
    />
  );
}

/**
 * Team-focused org view. A hierarchy list (collapsible, searchable) sits next
 * to a focus panel showing one agent, its chain of command and its direct
 * reports as readable cards. It stays legible with hundreds of agents because
 * it never renders the whole organisation at once — the canvas chart remains
 * available for small organisations.
 */
export function OrgExplorer({ orgTree, agents }: OrgExplorerProps) {
  const { t } = useTranslation();
  const index = useMemo(() => indexOrgTree(orgTree), [orgTree]);
  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const [searchParams, setSearchParams] = useSearchParams();
  const focusParam = searchParams.get(ORG_FOCUS_PARAM);
  // A single top-level agent (usually the CEO) is the natural starting focus;
  // several roots start at the organisation level.
  const focusId = focusParam && index.byId.has(focusParam)
    ? focusParam
    : index.roots.length === 1
      ? index.roots[0]!.id
      : null;

  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = defaultExpandedIds(index);
    if (focusId) for (const id of ancestorIds(index, [focusId])) initial.add(id);
    return initial;
  });
  // New agents (e.g. after a hire) get the same default as on first load.
  const knownIds = useRef(new Set(index.order));
  useEffect(() => {
    const defaults = defaultExpandedIds(index);
    const fresh = index.order.filter((id) => !knownIds.current.has(id) && defaults.has(id));
    knownIds.current = new Set(index.order);
    if (fresh.length > 0) setExpanded((prev) => new Set([...prev, ...fresh]));
  }, [index]);

  const searchFields = useCallback(
    (id: string) => {
      const agent = agentMap.get(id);
      return { title: agent?.title ?? null, role: roleLabels[agent?.role ?? ""] ?? null };
    },
    [agentMap],
  );
  const matches = useMemo(
    () => (query.trim() ? searchOrg(index, query, searchFields) : null),
    [index, query, searchFields],
  );
  const rows = useMemo(() => visibleOrgRows(index, expanded, matches), [index, expanded, matches]);

  const focus = useCallback(
    (id: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set(ORG_FOCUS_PARAM, id);
        else next.delete(ORG_FOCUS_PARAM);
        return next;
      });
      if (id) {
        setExpanded((prev) => {
          const next = new Set(prev);
          for (const ancestor of ancestorIds(index, [id])) next.add(ancestor);
          return next;
        });
      }
    },
    [index, setSearchParams],
  );

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const label = (id: string) => {
    const agent = agentMap.get(id);
    const node = index.byId.get(id)?.node;
    return {
      name: node?.name ?? agent?.name ?? id.slice(0, 8),
      subtitle: agent?.title ?? roleLabels[node?.role ?? ""] ?? node?.role ?? "",
    };
  };

  return (
    <div className="grid min-h-0 flex-1 gap-4 @3xl:grid-cols-3" data-testid="org-explorer">
      <section
        className="flex min-h-0 flex-col rounded-lg border border-border bg-card @3xl:col-span-1"
        aria-label={t("agents.org.hierarchy")}
      >
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && matches && matches[0]) focus(matches[0]);
                if (event.key === "Escape") setQuery("");
              }}
              placeholder={t("agents.org.searchPlaceholder")}
              aria-label={t("agents.org.searchPlaceholder")}
              className="h-8 pl-7 pr-7 text-sm"
            />
            {query ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setQuery("")}
                aria-label={t("agents.org.clearSearch")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {matches ? (
            <p className="mt-1.5 px-1 text-xs text-muted-foreground" aria-live="polite">
              {t("agents.org.matchCount", { count: matches.length })}
            </p>
          ) : null}
        </div>
        <ul role="tree" aria-label={t("agents.org.hierarchy")} className="min-h-0 flex-1 overflow-y-auto py-1">
          {rows.map((row) => {
            const { name, subtitle } = label(row.id);
            const status = index.byId.get(row.id)?.node.status ?? "idle";
            const isFocused = row.id === focusId;
            return (
              <li
                key={row.id}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={row.hasChildren ? row.expanded : undefined}
                aria-selected={isFocused}
                data-org-row={row.id}
                className={cn(
                  "flex items-center gap-1 pr-2",
                  isFocused ? "bg-accent text-foreground" : "hover:bg-accent/50",
                  row.contextOnly && "opacity-70",
                )}
                style={{ paddingInlineStart: `calc(var(--spacing) * ${row.depth * 4 + 1})` }}
              >
                {row.hasChildren ? (
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    onClick={() => toggle(row.id)}
                    aria-label={row.expanded ? t("agents.org.collapse", { name }) : t("agents.org.expand", { name })}
                  >
                    {row.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                ) : (
                  <span className="h-6 w-6 shrink-0" aria-hidden />
                )}
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                  onClick={() => focus(row.id)}
                  title={subtitle ? `${name} — ${subtitle}` : name}
                >
                  <StatusDot status={status} />
                  <span className="min-w-0 truncate text-sm">{name}</span>
                  {subtitle ? <span className="hidden min-w-0 truncate text-xs text-muted-foreground @lg:inline">{subtitle}</span> : null}
                </button>
                {row.descendantCount > 0 ? (
                  <span
                    className="shrink-0 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground"
                    title={t("agents.org.teamSize", { count: row.descendantCount })}
                  >
                    {row.descendantCount}
                  </span>
                ) : null}
              </li>
            );
          })}
          {rows.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t("agents.org.noMatches")}</li>
          ) : null}
        </ul>
      </section>

      <FocusPanel
        index={index}
        agentMap={agentMap}
        focusId={focusId}
        onFocus={focus}
        label={label}
      />
    </div>
  );
}

function FocusPanel({
  index,
  agentMap,
  focusId,
  onFocus,
  label,
}: {
  index: OrgIndex;
  agentMap: Map<string, Agent>;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  label: (id: string) => { name: string; subtitle: string };
}) {
  const { t } = useTranslation();
  const path = focusId ? orgPath(index, focusId) : [];
  const reports = directReports(index, focusId);
  const focusEntry = focusId ? index.byId.get(focusId) : undefined;
  const focusAgent = focusId ? agentMap.get(focusId) : undefined;
  const summary = focusId ? teamStatusSummary(index, focusId) : null;
  const statusSummary = summary
    ? Object.entries(summary.byStatus)
        .sort(([, a], [, b]) => b - a)
        .map(([status, count]) => ({ status, count }))
    : [];

  return (
    <section className="flex min-h-0 flex-col gap-4 overflow-y-auto @3xl:col-span-2" aria-label={t("agents.org.team")}>
      <nav aria-label={t("agents.org.chainOfCommand")} className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {index.roots.length > 1 ? (
          <>
            <button type="button" className="hover:text-foreground" onClick={() => onFocus(null)}>
              {t("agents.org.organization")}
            </button>
            {path.length > 0 ? <ChevronRight className="h-3 w-3" aria-hidden /> : null}
          </>
        ) : null}
        {path.map((entry, i) => (
          <span key={entry.node.id} className="inline-flex items-center gap-1">
            {i > 0 ? <ChevronRight className="h-3 w-3" aria-hidden /> : null}
            {i === path.length - 1 ? (
              <span className="font-medium text-foreground" aria-current="page">{entry.node.name}</span>
            ) : (
              <button type="button" className="hover:text-foreground" onClick={() => onFocus(entry.node.id)}>
                {entry.node.name}
              </button>
            )}
          </span>
        ))}
      </nav>

      {focusEntry ? (
        <div className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-card p-4" data-testid="org-focus-card">
          <div className="relative shrink-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <AgentAvatar agent={focusAgent} size={24} />
            </div>
            <StatusDot status={focusEntry.node.status} className="absolute -bottom-0.5 -right-0.5 h-3 w-3 border-2 border-card" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={focusAgent ? agentUrl(focusAgent) : `/agents/${focusEntry.node.id}`}
                className="text-base font-semibold text-foreground hover:underline"
              >
                {focusEntry.node.name}
              </Link>
              <AgentStatusBadge status={focusEntry.node.status} />
            </div>
            <p className="text-sm text-muted-foreground">{label(focusEntry.node.id).subtitle}</p>
            {focusEntry.parentId ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("agents.org.reportsTo")}{" "}
                <button type="button" className="text-foreground hover:underline" onClick={() => onFocus(focusEntry.parentId)}>
                  {label(focusEntry.parentId).name}
                </button>
              </p>
            ) : null}
            {summary && summary.total > 1 ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="org-team-summary">
                <span>
                  {t("agents.org.directReports", { count: reports.length })} · {t("agents.org.teamSize", { count: summary.total - 1 })}
                </span>
                {statusSummary.map(({ status, count }) => (
                  <span key={status} className="inline-flex items-center gap-1">
                    <StatusDot status={status} />
                    {count} {t(`agents.status.${status}`, { defaultValue: status.replace(/_/g, " ") })}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {focusEntry ? t("agents.org.directReportsHeading") : t("agents.org.topLevel")}
        </h3>
        {reports.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t("agents.org.noReports")}
          </p>
        ) : (
          <ul className="grid gap-3 @lg:grid-cols-2 @5xl:grid-cols-3" data-testid="org-report-grid">
            {reports.map((child) => {
              const agent = agentMap.get(child.id);
              const entry = index.byId.get(child.id);
              const { subtitle } = label(child.id);
              const teamSize = entry?.descendantCount ?? 0;
              return (
                <li key={child.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3" data-org-report={child.id}>
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                        <AgentAvatar agent={agent} size={16} />
                      </div>
                      <StatusDot status={child.status} className="absolute -bottom-0.5 -right-0.5 h-3 w-3 border-2 border-card" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={agent ? agentUrl(agent) : `/agents/${child.id}`}
                        className="block truncate text-sm font-semibold text-foreground hover:underline"
                      >
                        {child.name}
                      </Link>
                      {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
                    </div>
                    <AgentStatusBadge status={child.status} />
                  </div>
                  {teamSize > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="self-start"
                      onClick={() => onFocus(child.id)}
                    >
                      <Users className="h-3 w-3" />
                      {t("agents.org.viewTeam", { count: teamSize })}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
