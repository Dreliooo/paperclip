import { useMemo, useState } from "react";
import { Clock, X } from "lucide-react";
import type { Issue, IssueWorkProduct } from "@paperclipai/shared";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { InlineBanner } from "@/components/InlineBanner";
import { IssuePullRequestLinks } from "@/components/IssuePullRequestLinks";
import { getIssuePullRequests, pullRequestNeedsReview } from "@/lib/issue-pull-requests";
import { t, useTranslation } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  deriveMonitorState,
  formatMonitorAbsolute,
  formatMonitorEta,
  useMonitorCountdown,
  type DerivedMonitorState,
  type MonitorDisplayState,
} from "@/lib/issue-monitor";

/** Matches the `Date | string` inputs accepted by the issue-monitor helpers. */
type MonitorDate = Date | string;

/**
 * States in which the waiting-monitor surfaces (top banner + composer strip)
 * are shown. `cleared` and `none` hide both surfaces entirely — see
 * wireframe 04 (PAP-14557).
 */
const WAITING_STATES: readonly MonitorDisplayState[] = [
  "scheduled",
  "retrying",
  "due-now",
  "overdue",
];

export function isWaitingMonitorState(state: MonitorDisplayState): boolean {
  return WAITING_STATES.includes(state);
}

export function hasVisibleMonitorSurface(issue: Issue): boolean {
  const derived = deriveMonitorState(issue);
  return isWaitingMonitorState(derived.state) && derived.nextCheckAt !== null;
}

export interface MonitorSurfaceCopy {
  /** Prominent lead for the top banner, e.g. "Waiting on monitor — resumes in 2h 12m". */
  bannerTitle: string;
  /** Prominent lead for the composer strip, e.g. "Resumes in 2h 12m". */
  stripTitle: string;
  /** Muted detail line for the banner (absolute time carries a "(your time)" hint). */
  bannerMeta: string[];
  /** Muted detail line for the composer strip. */
  stripMeta: string[];
  /** `warning` (amber) once overdue, `info` (blue) while still on schedule. */
  tone: "info" | "warning";
  workspaceWait?: boolean;
  pullRequestReview?: boolean;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/**
 * Pure copy builder shared by the banner and the composer strip so both
 * surfaces render one consistent copy system (see wireframe 04). Kept free of
 * hooks/`Date.now()` so it is deterministic under test.
 */
export function buildMonitorSurfaceCopy(
  derived: DerivedMonitorState,
  now: MonitorDate,
  scheduledRetryReason?: string | null,
  pendingPullRequestReviews = 0,
): MonitorSurfaceCopy | null {
  if (!isWaitingMonitorState(derived.state) || !derived.nextCheckAt) return null;

  if (derived.source === "scheduled-retry" && scheduledRetryReason === "workspace_busy") {
    return {
      bannerTitle: t("ui2g0.issueMonitor.waitingWorkspace"),
      stripTitle: t("ui2g0.issueMonitor.waitingWorkspace"),
      bannerMeta: [t("ui2g0.issueMonitor.workspaceBusyMeta")],
      stripMeta: [t("ui2g0.issueMonitor.workspaceBusyStrip")],
      tone: "info",
      workspaceWait: true,
    };
  }

  const eta = formatMonitorEta(derived.nextCheckAt, now); // "in 2h 12m" | "due now" | "overdue by 18m"
  const absolute = formatMonitorAbsolute(derived.nextCheckAt, {}, now); // local time, e.g. "Today, 4:08 PM"
  if (derived.source === "monitor" && derived.serviceName?.toLowerCase() === "github" && pendingPullRequestReviews > 0) {
    return {
      bannerTitle: t("ui2g0.issueMonitor.prReview"),
      stripTitle: t("ui2g0.issueMonitor.prReview"),
      bannerMeta: [t("ui2g0.issueMonitor.prNextCheck", { eta, absolute })],
      stripMeta: [t("ui2g0.issueMonitor.prNextCheckStrip", { eta, absolute })],
      tone: derived.state === "overdue" ? "warning" : "info",
      pullRequestReview: true,
    };
  }
  if (derived.source === "scheduled-retry" && scheduledRetryReason === "ai_connection_pool_wait") {
    return {
      bannerTitle: t("ui2g0.issueMonitor.poolExhausted"),
      stripTitle: t("ui2g0.issueMonitor.poolExhausted"),
      bannerMeta: [t("ui2g0.issueMonitor.poolUsageRecheck", { eta, absolute }), t("ui2g0.issueMonitor.poolKeepAccount")],
      stripMeta: [t("ui2g0.issueMonitor.poolUsageRecheckStrip", { eta, absolute }), t("ui2g0.issueMonitor.poolKeepAccountStrip")],
      tone: "info",
    };
  }

  const isScheduledRetryOnly = derived.source === "scheduled-retry";

  let bannerTitle: string;
  let stripTitle: string;
  let statusHint: string | null = null;
  switch (derived.state) {
    case "scheduled":
    case "retrying":
      bannerTitle = isScheduledRetryOnly ? t("ui2g0.issueMonitor.agentResumes", { eta }) : t("ui2g0.issueMonitor.monitorResumes", { eta });
      stripTitle = t("ui2g0.issueMonitor.resumes", { eta });
      break;
    case "due-now":
      bannerTitle = isScheduledRetryOnly ? t("ui2g0.issueMonitor.agentRetryDueNow") : t("ui2g0.issueMonitor.monitorDueNow");
      stripTitle = t("ui2g0.issueMonitor.dueNow");
      statusHint = t("ui2g0.issueMonitor.checkingMomentarily");
      break;
    case "overdue":
    default:
      bannerTitle = isScheduledRetryOnly ? t("ui2g0.issueMonitor.agentRetry", { eta }) : t("ui2g0.issueMonitor.monitorEta", { eta });
      stripTitle = capitalize(eta);
      statusHint = t("ui2g0.issueMonitor.firesNextTick");
      break;
  }

  const attemptLabel = derived.attemptCount >= 1 ? t("ui2g0.issueMonitor.attempt", { count: derived.attemptCount }) : null;
  const serviceLabel = derived.serviceName ? t("ui2g0.issueMonitor.watching", { name: derived.serviceName }) : null;

  const bannerMeta = [statusHint, t("ui2g0.issueMonitor.yourTime", { absolute }), attemptLabel, serviceLabel].filter(
    (piece): piece is string => Boolean(piece),
  );
  const stripMeta = [statusHint, absolute, attemptLabel, serviceLabel].filter(
    (piece): piece is string => Boolean(piece),
  );

  return {
    bannerTitle,
    stripTitle,
    bannerMeta,
    stripMeta,
    tone: derived.state === "overdue" ? "warning" : "info",
  };
}

function useMonitorSurfaceCopy(issue: Issue, pendingPullRequestReviews: number): MonitorSurfaceCopy | null {
  // `nextCheckAt` is stable for a given issue; derive once to seed the ticking
  // countdown cadence, then re-derive against the live clock so the surfaces
  // roll scheduled → due → overdue on their own.
  const nextCheckAt = useMemo(() => deriveMonitorState(issue).nextCheckAt, [issue]);
  const now = useMonitorCountdown(nextCheckAt);
  return useMemo(() => buildMonitorSurfaceCopy(deriveMonitorState(issue, now), now, issue.scheduledRetry?.scheduledRetryReason, pendingPullRequestReviews), [issue, now, pendingPullRequestReviews]);
}

function CheckNowButton({
  onCheckNow,
  checkingNow,
  reviewRequested = false,
}: {
  onCheckNow: () => void;
  checkingNow: boolean;
  reviewRequested?: boolean;
}) {
  useTranslation();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0 shadow-none"
      onClick={onCheckNow}
      disabled={checkingNow}
    >
      {checkingNow ? t("ui2g0.issueMonitor.checking") : reviewRequested ? t("ui2g0.issueMonitor.checkStatus") : t("ui2g0.issueMonitor.checkNow")}
    </Button>
  );
}

function CancelMonitorButton({ onCancel }: { onCancel: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = async () => {
    setPending(true);
    setError(null);
    try {
      await onCancel();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ui2g0.issueMonitor.cancelFailed"));
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); setError(null); } }}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-2" aria-label={t("ui2g0.issueMonitor.cancelMonitor")} title={t("ui2g0.issueMonitor.cancelMonitor")}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("ui2g0.issueMonitor.cancelMonitorQuestion")}</AlertDialogTitle>
          <AlertDialogDescription>{t("ui2g0.issueMonitor.cancelDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("ui2g0.issueMonitor.keepMonitor")}</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={pending} onClick={() => void cancel()}>{pending ? t("ui2g0.issueMonitor.cancelling") : t("ui2g0.issueMonitor.cancelMonitor")}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export interface IssueMonitorSurfaceProps {
  issue: Issue;
  onCheckNow?: (() => void) | null;
  checkingNow?: boolean;
  workProducts?: IssueWorkProduct[] | null;
  checkError?: string | null;
  onCancelMonitor?: (() => Promise<unknown>) | null;
}

/**
 * Pinned banner rendered between the issue title and description while a
 * monitor is waiting. Replaces the description-area "Monitor scheduled" card
 * for the waiting state (PAP-14557 decision 1) — the two never render at once.
 */
export function IssueMonitorBanner({
  issue,
  onCheckNow = null,
  checkingNow = false,
  workProducts,
  checkError,
  onCancelMonitor,
}: IssueMonitorSurfaceProps) {
  const reviews = getIssuePullRequests(workProducts).filter(pullRequestNeedsReview);
  const copy = useMonitorSurfaceCopy(issue, reviews.length);
  if (!copy) return null;

  const canCancel = onCancelMonitor && deriveMonitorState(issue).source === "monitor";

  return (
    <InlineBanner
      tone={copy.tone}
      icon={Clock}
      title={copy.bannerTitle}
      className={cn("relative my-3", canCancel && "pr-12")}
      actions={onCheckNow && !copy.workspaceWait ? <CheckNowButton onCheckNow={onCheckNow} checkingNow={checkingNow} reviewRequested={copy.pullRequestReview} /> : null}
    >
      {canCancel ? <CancelMonitorButton key={issue.id} onCancel={onCancelMonitor} /> : null}
      <div className="flex flex-col gap-2">
        {copy.pullRequestReview ? <IssuePullRequestLinks products={reviews} /> : null}
        <span>{copy.bannerMeta.join("  ·  ")}</span>
        {checkError ? <p role="alert">{checkError}</p> : null}
      </div>
    </InlineBanner>
  );
}

/**
 * Slim, inline (not sticky) strip anchored directly above the reply composer.
 * Mirrors the banner's monitor state and reminds the reader that replying wakes
 * the agent early (PAP-14557 decisions 2 + wireframe 02).
 */
export function IssueMonitorComposerStrip({
  issue,
  onCheckNow = null,
  checkingNow = false,
  workProducts,
  checkError,
  className,
}: IssueMonitorSurfaceProps & { className?: string }) {
  useTranslation();
  const reviews = getIssuePullRequests(workProducts).filter(pullRequestNeedsReview);
  const copy = useMonitorSurfaceCopy(issue, reviews.length);
  if (!copy) return null;

  return (
    <div
      role="note"
      data-testid="issue-monitor-composer-strip"
      className={cn("rounded-lg border border-border bg-muted/30 px-3 py-2", className)}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="text-sm font-medium text-foreground">{copy.stripTitle}</div>
            {copy.pullRequestReview ? <IssuePullRequestLinks products={reviews} /> : null}
            <div className="text-xs text-muted-foreground">{copy.stripMeta.join(" · ")}</div>
          </div>
        </div>
        {onCheckNow && !copy.workspaceWait ? <CheckNowButton onCheckNow={onCheckNow} checkingNow={checkingNow} reviewRequested={copy.pullRequestReview} /> : null}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {copy.pullRequestReview
          ? t("ui2g0.issueMonitor.reviewOnGithub")
          : copy.workspaceWait
          ? t("ui2g0.issueMonitor.keepSending")
          : t("ui2g0.issueMonitor.replyWakes")}
      </p>
      {checkError ? <p role="alert" className="text-sm text-destructive">{checkError}</p> : null}
    </div>
  );
}
