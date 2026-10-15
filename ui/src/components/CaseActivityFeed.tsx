import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { Bot, User, Cog, ChevronDown, ListFilter } from "lucide-react";
import type { CaseEvent, CaseEventKind } from "@/api/cases";
import { Button } from "@/components/ui/button";
import { StatusIcon } from "@/components/StatusIcon";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t, useTranslation } from "@/i18n";
import { cn, relativeTime } from "@/lib/utils";

const EVENT_LABEL: Record<CaseEventKind, string> = {
  created: "ui2g0.caseActivity.kind.created",
  updated: "ui2g0.caseActivity.kind.updated",
  fields_changed: "ui2g0.caseActivity.kind.fields_changed",
  status_changed: "ui2g0.caseActivity.kind.status_changed",
  issue_linked: "ui2g0.caseActivity.kind.issue_linked",
  issue_unlinked: "ui2g0.caseActivity.kind.issue_unlinked",
  document_revised: "ui2g0.caseActivity.kind.document_revised",
  child_linked: "ui2g0.caseActivity.kind.child_linked",
  attachment_added: "ui2g0.caseActivity.kind.attachment_added",
  label_added: "ui2g0.caseActivity.kind.label_added",
  label_removed: "ui2g0.caseActivity.kind.label_removed",
};

function eventLabel(kind: CaseEventKind): string {
  return EVENT_LABEL[kind] ? t(EVENT_LABEL[kind]) : kind;
}

/** Human label for the actor, preferring the resolved agent name. */
function actorLabel(event: CaseEvent): string {
  if (event.actorType === "agent") return event.actorAgentName ?? t("ui2g0.caseActivity.agent");
  if (event.actorType === "user") return t("ui2g0.caseActivity.user");
  return t("ui2g0.caseActivity.system");
}

function ActorIcon({ event }: { event: CaseEvent }) {
  const Icon = event.actorType === "agent" ? Bot : event.actorType === "user" ? User : Cog;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}

function issueRelationLabel(event: CaseEvent): string {
  return event.kind === "issue_linked" || event.kind === "issue_unlinked" ? t("ui2g0.caseActivity.issue") : t("ui2g0.caseActivity.via");
}

/** One event with actor + run→issue attribution (P4 §1). */
export function CaseEventRow({ event, compact = false }: { event: CaseEvent; compact?: boolean }) {
  useTranslation();
  const detail =
    event.kind === "status_changed" && event.payload
      ? `${(event.payload.previousStatus as string) ?? "?"} → ${(event.payload.status as string) ?? "?"}`
      : "";
  return (
    <div className={cn("flex items-start gap-2 text-xs", compact ? "py-1.5" : "py-2")}>
      <span className="mt-1"><ActorIcon event={event} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-medium">{eventLabel(event.kind)}</span>
          {detail && <span className="text-muted-foreground">· {detail}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
          <span>{actorLabel(event)}</span>
          {event.issue && (
            <>
              <span aria-hidden>·</span>
              <span>{issueRelationLabel(event)}</span>
              <Link
                to={`/issues/${event.issue.identifier}`}
                className="inline-flex min-w-0 items-center gap-1 text-foreground/80 hover:underline"
                title={event.issue.title}
              >
                <StatusIcon status={event.issue.status} size="sm" />
                <span className="shrink-0 font-mono">{event.issue.identifier}</span>
                <span className="min-w-0 truncate">{event.issue.title}</span>
              </Link>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{relativeTime(event.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

/** The full activity feed with kind filters (detail-page Activity tab). */
export function CaseActivityFeed({ events }: { events: CaseEvent[] }) {
  useTranslation();
  const [active, setActive] = useState<Set<CaseEventKind>>(new Set());

  // Only offer filters for kinds actually present, in first-seen order.
  const presentKinds = useMemo(() => {
    const seen: CaseEventKind[] = [];
    for (const e of events) if (!seen.includes(e.kind)) seen.push(e.kind);
    return seen;
  }, [events]);

  const filtered = useMemo(
    () => (active.size === 0 ? events : events.filter((e) => active.has(e.kind))),
    [events, active],
  );

  function toggle(kind: CaseEventKind) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const filterLabel = active.size === 0
    ? t("ui2g0.caseActivity.allActivity")
    : active.size === 1
      ? eventLabel([...active][0]!)
      : t("ui2g0.caseActivity.filtersCount", { count: active.size });

  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("ui2g0.caseActivity.noActivity")}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t("ui2g0.caseActivity.ofEvents", { shown: filtered.length, total: events.length })}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <ListFilter className="h-3.5 w-3.5" />
              {filterLabel}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{t("ui2g0.caseActivity.activityFilter")}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setActive(new Set())}>
              {t("ui2g0.caseActivity.allActivity")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {presentKinds.map((kind) => (
              <DropdownMenuCheckboxItem
                key={kind}
                checked={active.has(kind)}
                onCheckedChange={() => toggle(kind)}
              >
                {eventLabel(kind)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("ui2g0.caseActivity.noMatch")}</p>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((event) => (
            <CaseEventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
