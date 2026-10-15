import { useMemo } from "react";
import { ArrowUpRight, Bot, Cog, User } from "lucide-react";
import type { Agent, AttentionItem } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { useTranslation } from "../i18n";
import { describeAttentionOrigin, type AttentionContextLinkKind } from "../lib/attention-origin";
import { ProjectTile } from "./ProjectTile";
import { Button } from "./ui/button";

interface AttentionOriginStripProps {
  item: AttentionItem;
  agentMap?: Map<string, Agent>;
  userLabelMap?: ReadonlyMap<string, string> | null;
}

const CONTEXT_TITLE_KEYS: Record<AttentionContextLinkKind, string> = {
  comment: "decisions.origin.contextTitle.comment",
  interaction: "decisions.origin.contextTitle.interaction",
  task: "decisions.origin.contextTitle.task",
  approval: "decisions.origin.contextTitle.approval",
  source: "decisions.origin.contextTitle.source",
};

/**
 * "Where does this come from?" band for a decision row: requester, task and
 * project, plus a "View context" link to the exact origin. Facts the server did
 * not return are shown as missing, never guessed (see describeAttentionOrigin).
 */
export function AttentionOriginStrip({ item, agentMap, userLabelMap }: AttentionOriginStripProps) {
  const { t } = useTranslation();
  const origin = useMemo(
    () =>
      describeAttentionOrigin(item, {
        agentName: (id) => agentMap?.get(id)?.name,
        userName: (id) => userLabelMap?.get(id),
      }),
    [item, agentMap, userLabelMap],
  );
  const { requester, task, project, context } = origin;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
      data-attention-origin="true"
    >
      <dl className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <div className="inline-flex min-w-0 items-center gap-1" data-attention-origin-requester>
          <dt className="sr-only">{t("decisions.origin.requestedBy")}</dt>
          {requester?.kind === "agent" ? (
            <Bot className="h-3 w-3 shrink-0" aria-hidden />
          ) : requester?.kind === "system" ? (
            <Cog className="h-3 w-3 shrink-0" aria-hidden />
          ) : (
            <User className="h-3 w-3 shrink-0" aria-hidden />
          )}
          <dd className="min-w-0 truncate">
            {requester?.kind === "agent" || requester?.kind === "user"
              ? t("decisions.origin.requestedByName", { name: requester.name })
              : requester?.kind === "system"
                ? t("decisions.origin.automatic")
                : <span className="italic">{t("decisions.origin.requesterMissing")}</span>}
          </dd>
        </div>

        <div className="inline-flex min-w-0 items-center gap-1" data-attention-origin-task>
          <dt className="sr-only">{t("decisions.origin.task")}</dt>
          <dd className="min-w-0 truncate">
            {task ? (
              <>
                {task.identifier ? <span className="font-mono">{task.identifier}</span> : null}
                {task.identifier && task.title ? " " : null}
                {task.title ?? null}
              </>
            ) : (
              <span className="italic">{t("decisions.origin.taskMissing")}</span>
            )}
          </dd>
        </div>

        {task ? (
          <div className="inline-flex min-w-0 items-center gap-1" data-attention-origin-project>
            <dt className="sr-only">{t("decisions.origin.project")}</dt>
            <dd className="inline-flex min-w-0 items-center gap-1">
              {project ? (
                <Link
                  to={project.href}
                  className="inline-flex min-w-0 items-center gap-1 hover:text-foreground"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ProjectTile size="xs" icon={project.icon} color={project.color} />
                  <span className="truncate">{project.name}</span>
                </Link>
              ) : (
                <span className="italic">{t("decisions.origin.projectMissing")}</span>
              )}
            </dd>
          </div>
        ) : null}
      </dl>

      {context ? (
        <Button asChild variant="outline" size="xs" className="shrink-0">
          <Link
            to={context.href}
            title={t(CONTEXT_TITLE_KEYS[context.kind])}
            onClick={(event) => event.stopPropagation()}
            data-attention-view-context={context.kind}
          >
            {t("decisions.origin.viewContext")}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Button>
      ) : (
        <span className="text-xs italic text-muted-foreground" data-attention-view-context="none">
          {t("decisions.origin.contextMissing")}
        </span>
      )}
    </div>
  );
}
