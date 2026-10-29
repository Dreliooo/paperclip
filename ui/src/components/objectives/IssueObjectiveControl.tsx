import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Network, Pause, Play, Square, SlidersHorizontal } from "lucide-react";
import type { Agent, IssueObjective, IssueObjectiveAction, IssueObjectiveStatus } from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { issuesApi } from "@/api/issues";
import { issueObjectivesApi } from "@/api/issueObjectives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToastActions } from "@/context/ToastContext";
import { currentLocale, useTranslation } from "@/i18n";
import { useNavigate } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import {
  OBJECTIVE_TIME_PRESETS,
  deadlineFromPreset,
  formatTokensShort,
  objectiveTaskTitle,
  parseCriteria,
  parseDollarsToCents,
  parseTokenLimit,
  usagePercent,
  type ObjectiveTimePreset,
} from "@/lib/objective-form";
import { formatUsdCents } from "@/lib/usage-display";
import { cn, issueUrl } from "@/lib/utils";

const OPEN_STATUSES: IssueObjectiveStatus[] = ["active", "paused", "limit_reached"];

type DialogMode = "create" | "limits";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function defaultCoordinator(agents: Agent[], fallbackAgentId: string | null) {
  const usable = agents.filter((agent) => agent.status !== "terminated");
  return usable.find((agent) => agent.role === "ceo")?.id
    ?? (fallbackAgentId && usable.some((agent) => agent.id === fallbackAgentId) ? fallbackAgentId : null)
    ?? usable[0]?.id
    ?? "";
}

function centsToInput(cents: number | null) {
  return cents === null ? "" : String(cents / 100);
}

function ObjectiveDialog({
  mode,
  open,
  onOpenChange,
  issueId,
  companyId,
  conversationMode,
  defaultCoordinatorAgentId,
  objective,
}: {
  mode: DialogMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  companyId: string | null;
  conversationMode: boolean;
  defaultCoordinatorAgentId: string | null;
  objective: IssueObjective | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pushToast } = useToastActions();
  const [text, setText] = useState("");
  const [criteria, setCriteria] = useState("");
  const [coordinatorAgentId, setCoordinatorAgentId] = useState("");
  const [dollars, setDollars] = useState("");
  const [tokens, setTokens] = useState("");
  const [timePreset, setTimePreset] = useState<ObjectiveTimePreset | "keep">("none");
  const [formError, setFormError] = useState<string | null>(null);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId ?? ""),
    queryFn: () => agentsApi.list(companyId!),
    enabled: open && mode === "create" && Boolean(companyId),
  });
  const agents = useMemo(
    () => (agentsQuery.data ?? []).filter((agent) => agent.status !== "terminated"),
    [agentsQuery.data],
  );

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (mode === "limits" && objective) {
      setDollars(centsToInput(objective.limits.maxSpendCents));
      setTokens(objective.limits.maxTokens === null ? "" : String(objective.limits.maxTokens));
      setTimePreset(objective.limits.deadlineAt ? "keep" : "none");
    } else {
      setText("");
      setCriteria("");
      setDollars("");
      setTokens("");
      setTimePreset("none");
    }
  }, [mode, objective, open]);

  useEffect(() => {
    if (open && mode === "create" && !coordinatorAgentId && agents.length > 0) {
      setCoordinatorAgentId(defaultCoordinator(agents, defaultCoordinatorAgentId));
    }
  }, [agents, coordinatorAgentId, defaultCoordinatorAgentId, mode, open]);

  const submit = useMutation({
    mutationFn: async () => {
      const maxSpendCents = parseDollarsToCents(dollars);
      const maxTokens = parseTokenLimit(tokens);
      if (maxSpendCents === undefined) throw new Error(t("objective.dialog.invalidDollars"));
      if (maxTokens === undefined) throw new Error(t("objective.dialog.invalidTokens"));
      if (mode === "limits") {
        const deadlineAt = timePreset === "keep" ? undefined : deadlineFromPreset(timePreset, new Date());
        await issueObjectivesApi.update(issueId, {
          maxSpendCents,
          maxTokens,
          ...(deadlineAt !== undefined ? { deadlineAt } : {}),
        });
        return null;
      }
      const objectiveText = text.trim();
      if (!objectiveText) throw new Error(t("objective.dialog.objectiveRequired"));
      if (!coordinatorAgentId) throw new Error(t("objective.dialog.coordinatorRequired"));
      const draft = {
        objective: objectiveText,
        successCriteria: parseCriteria(criteria),
        coordinatorAgentId,
        maxSpendCents,
        maxTokens,
        deadlineAt: timePreset === "keep" ? null : deadlineFromPreset(timePreset, new Date()),
      };
      if (conversationMode) {
        // Agent chats are conversations, which cannot be delegated from;
        // the objective gets its own task and the person is taken there.
        if (!companyId) throw new Error(t("objective.dialog.noCompany"));
        const task = await issuesApi.create(companyId, {
          title: objectiveTaskTitle(objectiveText),
          description: objectiveText,
          status: "todo",
          assigneeAgentId: coordinatorAgentId,
        });
        await issueObjectivesApi.create(task.id, draft);
        return task;
      }
      await issueObjectivesApi.create(issueId, draft);
      return null;
    },
    onSuccess: async (task) => {
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.issueObjective(task?.id ?? issueId) });
      pushToast({
        title: mode === "limits" ? t("objective.toast.limitsSaved") : t("objective.toast.started"),
        tone: "success",
      });
      if (task) navigate(issueUrl(task));
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const timeOptions: Array<ObjectiveTimePreset | "keep"> = mode === "limits" && objective?.limits.deadlineAt
    ? ["keep", ...OBJECTIVE_TIME_PRESETS]
    : [...OBJECTIVE_TIME_PRESETS];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submit.isPending) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "limits" ? t("objective.dialog.limitsTitle") : t("objective.dialog.title")}</DialogTitle>
          <DialogDescription>
            {mode === "limits"
              ? t("objective.dialog.limitsDescription")
              : conversationMode
                ? t("objective.dialog.descriptionFromChat")
                : t("objective.dialog.description")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          {mode === "create" ? (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="objective-text">{t("objective.dialog.objectiveLabel")}</label>
                <Textarea
                  id="objective-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={t("objective.dialog.objectivePlaceholder")}
                  rows={3}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="objective-criteria">{t("objective.dialog.criteriaLabel")}</label>
                <Textarea
                  id="objective-criteria"
                  value={criteria}
                  onChange={(event) => setCriteria(event.target.value)}
                  placeholder={t("objective.dialog.criteriaPlaceholder")}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">{t("objective.dialog.criteriaHint")}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="objective-coordinator">{t("objective.dialog.coordinatorLabel")}</label>
                <NativeSelect
                  id="objective-coordinator"
                  value={coordinatorAgentId}
                  onChange={(event) => setCoordinatorAgentId(event.target.value)}
                  disabled={agentsQuery.isLoading}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.title ? `${agent.name} · ${agent.title}` : agent.name}</option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">{t("objective.dialog.coordinatorHint")}</p>
              </div>
            </>
          ) : null}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("objective.dialog.limitsLabel")}</legend>
            <p className="text-xs text-muted-foreground">{t("objective.dialog.limitsHint")}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="objective-dollars">{t("objective.dialog.dollarsLabel")}</label>
                <Input id="objective-dollars" inputMode="decimal" value={dollars} onChange={(event) => setDollars(event.target.value)} placeholder={t("objective.dialog.noLimit")} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="objective-tokens">{t("objective.dialog.tokensLabel")}</label>
                <Input id="objective-tokens" value={tokens} onChange={(event) => setTokens(event.target.value)} placeholder={t("objective.dialog.noLimit")} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="objective-time">{t("objective.dialog.timeLabel")}</label>
                <NativeSelect id="objective-time" value={timePreset} onChange={(event) => setTimePreset(event.target.value as ObjectiveTimePreset | "keep")}>
                  {timeOptions.map((preset) => (
                    <option key={preset} value={preset}>{t(`objective.time.${preset}`)}</option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          </fieldset>
          {formError ? <p className="text-sm text-destructive" role="alert">{formError}</p> : null}
          <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
              {t("objective.dialog.cancel")}
            </Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {mode === "limits" ? t("objective.dialog.saveLimits") : t("objective.dialog.start")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsageMeter({ label, value, percent }: { label: string; value: string; percent: number | null }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="truncate tabular-nums">{value}</span>
      </div>
      {percent !== null ? (
        <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn("h-full rounded-full", percent >= 100 ? "bg-destructive" : percent >= 80 ? "bg-amber-500" : "bg-primary")}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function IssueObjectiveCard({
  issueId,
  objective,
  onEditLimits,
}: {
  issueId: string;
  objective: IssueObjective;
  onEditLimits: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const locale = currentLocale();
  const act = useMutation({
    mutationFn: (action: IssueObjectiveAction) => issueObjectivesApi.act(issueId, action),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.issueObjective(issueId) });
    },
    onError: (error) => pushToast({ title: t("objective.toast.actionFailed"), body: errorMessage(error), tone: "error" }),
  });

  const { progress, usage, limits, status } = objective;
  const isOpen = OPEN_STATUSES.includes(status);
  const donePercent = progress.totalTasks > 0 ? Math.round((progress.doneTasks / progress.totalTasks) * 100) : null;
  const remainingMs = limits.deadlineAt ? Date.parse(limits.deadlineAt) - Date.now() : null;
  const remaining = remainingMs === null
    ? null
    : remainingMs <= 0
      ? t("objective.card.timeUp")
      : remainingMs >= 2 * 60 * 60_000
        ? t("objective.card.hoursLeft", { count: Math.round(remainingMs / (60 * 60_000)) })
        : t("objective.card.minutesLeft", { count: Math.max(1, Math.round(remainingMs / 60_000)) });

  return (
    <section
      className="mx-auto mb-2 w-full max-w-3xl rounded-lg border border-border bg-card px-3 py-2.5 text-sm shadow-xs"
      aria-label={t("objective.card.label")}
      data-testid="issue-objective-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Network className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="font-medium">{t("objective.card.title")}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            status === "active" && "bg-primary/10 text-primary",
            status === "paused" && "bg-muted text-muted-foreground",
            status === "limit_reached" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
            status === "achieved" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
            status === "stopped" && "bg-muted text-muted-foreground",
          )}
        >
          {t(`objective.status.${status}`)}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {status === "active" ? (
            <Button size="xs" variant="ghost" onClick={() => act.mutate("pause")} disabled={act.isPending}>
              <Pause className="size-3.5" aria-hidden />
              {t("objective.card.pause")}
            </Button>
          ) : null}
          {status === "paused" ? (
            <Button size="xs" variant="ghost" onClick={() => act.mutate("resume")} disabled={act.isPending}>
              <Play className="size-3.5" aria-hidden />
              {t("objective.card.resume")}
            </Button>
          ) : null}
          {isOpen ? (
            <>
              <Button size="xs" variant="ghost" onClick={onEditLimits}>
                <SlidersHorizontal className="size-3.5" aria-hidden />
                {t("objective.card.limits")}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => act.mutate("stop")} disabled={act.isPending}>
                <Square className="size-3.5" aria-hidden />
                {t("objective.card.stop")}
              </Button>
            </>
          ) : null}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-muted-foreground">{objective.objective}</p>
      {status === "limit_reached" && objective.limitReason ? (
        <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs" role="status">
          {t(`objective.card.limitReached.${objective.limitReason}`)}
        </p>
      ) : null}
      <div className="mt-2 space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span>
            {progress.totalTasks > 0
              ? t("objective.card.progress", { done: progress.doneTasks, total: progress.totalTasks })
              : t("objective.card.noSubtasks")}
          </span>
          <span className="text-muted-foreground">
            {[
              progress.blockedTasks > 0 ? t("objective.card.blocked", { count: progress.blockedTasks }) : null,
              progress.stalledTasks.length > 0 ? t("objective.card.stalled", { count: progress.stalledTasks.length }) : null,
              progress.activeRuns > 0 ? t("objective.card.working", { count: progress.activeRuns }) : null,
            ].filter(Boolean).join(" · ")}
          </span>
        </div>
        {donePercent !== null ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${donePercent}%` }} />
          </div>
        ) : null}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <UsageMeter
          label={t("objective.card.spend")}
          value={limits.maxSpendCents !== null
            ? t("objective.card.ofLimit", { used: formatUsdCents(usage.spentCents, locale), limit: formatUsdCents(limits.maxSpendCents, locale) })
            : formatUsdCents(usage.spentCents, locale)}
          percent={usagePercent(usage.spentCents, limits.maxSpendCents)}
        />
        <UsageMeter
          label={t("objective.card.tokens")}
          value={limits.maxTokens !== null
            ? t("objective.card.ofLimit", { used: formatTokensShort(usage.tokens), limit: formatTokensShort(limits.maxTokens) })
            : formatTokensShort(usage.tokens)}
          percent={usagePercent(usage.tokens, limits.maxTokens)}
        />
        <UsageMeter label={t("objective.card.time")} value={remaining ?? t("objective.card.noTimeLimit")} percent={null} />
      </div>
    </section>
  );
}

/**
 * Objective mode for a task chat: the "+" menu opens the dialog and the card
 * sits above the composer while an objective exists. In an agent chat the
 * dialog creates a new task for the objective instead.
 */
export function useIssueObjectiveControl({
  issueId,
  companyId,
  conversationMode,
  defaultCoordinatorAgentId,
}: {
  issueId: string | null;
  companyId: string | null;
  conversationMode: boolean;
  defaultCoordinatorAgentId: string | null;
}): { open: (() => void) | undefined; card: ReactNode; dialog: ReactNode } {
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const query = useQuery({
    queryKey: queryKeys.issueObjective(issueId ?? ""),
    queryFn: () => issueObjectivesApi.get(issueId!),
    enabled: Boolean(issueId) && !conversationMode,
    refetchInterval: (current) => {
      const status = current.state.data?.objective?.status;
      return status && OPEN_STATUSES.includes(status) ? 30_000 : false;
    },
  });
  const objective = query.data?.objective ?? null;
  const objectiveOpen = Boolean(objective && OPEN_STATUSES.includes(objective.status));
  const open = useCallback(() => setDialogMode(objectiveOpen ? "limits" : "create"), [objectiveOpen]);

  if (!issueId) return { open: undefined, card: null, dialog: null };

  return {
    open,
    card: objective && !conversationMode ? (
      <IssueObjectiveCard issueId={issueId} objective={objective} onEditLimits={() => setDialogMode("limits")} />
    ) : null,
    dialog: (
      <ObjectiveDialog
        mode={dialogMode ?? "create"}
        open={dialogMode !== null}
        onOpenChange={(next) => { if (!next) setDialogMode(null); }}
        issueId={issueId}
        companyId={companyId}
        conversationMode={conversationMode}
        defaultCoordinatorAgentId={defaultCoordinatorAgentId}
        objective={objective}
      />
    ),
  };
}
