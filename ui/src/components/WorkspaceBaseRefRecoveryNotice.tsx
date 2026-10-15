import { useId, useRef, useState } from "react";
import { isValidExistingBranchName } from "@paperclipai/shared";
import { Check, ChevronDown, GitBranch, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SystemNoticeMetadataSections } from "./SystemNotice";
import { cn } from "../lib/utils";
import { useTranslation } from "@/i18n";

export interface WorkspaceBaseRefRecoveryNoticeProps {
  requestedRef: string;
  repository: string;
  /** Only supply a default confirmed by the repository, never a guessed main/master. */
  defaultBranch?: string | null;
  agentName: string;
  /** Verified provenance, when available. */
  configuredBy?: string | null;
  taskOverride?: boolean;
  failureKind?: "missing_branch" | "unresolved_ref";
  unavailableReason?: string | null;
  /** Resolve only after both the task setting and retry have server receipts. */
  onRepair: (branch: string) => Promise<void>;
}

/** Inline task repair, also used by the interactive Storybook preview. */
export function WorkspaceBaseRefRecoveryNotice({
  requestedRef, repository, defaultBranch, agentName, configuredBy,
  taskOverride = true, failureKind = "unresolved_ref", unavailableReason, onRepair,
}: WorkspaceBaseRefRecoveryNoticeProps) {
  const { t } = useTranslation();
  const id = useId();
  const [editing, setEditing] = useState(!defaultBranch);
  const [branch, setBranch] = useState(defaultBranch ?? "");
  const [details, setDetails] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repairedBranch, setRepairedBranch] = useState<string | null>(null);
  const inFlight = useRef(false);
  const changed = branch.trim().length > 0 && branch.trim() !== requestedRef;

  async function repair(nextBranch: string) {
    const value = nextBranch.trim();
    if (!value || value === requestedRef || unavailableReason || inFlight.current || repairedBranch) return;
    if (!isValidExistingBranchName(value)) {
      setError(t("ui2g5.workspaceBaseRef.enterValidBranch"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await onRepair(value);
      setRepairedBranch(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("ui2g5.workspaceBaseRef.refreshTask"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 gap-3 rounded-lg border border-border bg-muted/20 p-4" data-testid="workspace-base-ref-recovery">
      {repairedBranch
        ? <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-(--status-task-icon-done)" />
        : <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-(--status-task-icon-blocked)" />}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1" role="status" aria-live="polite">
          <h2 id={`${id}-title`} className="break-words text-sm font-semibold">
            {repairedBranch ? t("ui2g5.workspaceBaseRef.branchUpdated") : failureKind === "missing_branch" ? <>{t("ui2g5.workspaceBaseRef.branchPrefix")}<code className="font-mono">{requestedRef}</code>{t("ui2g5.workspaceBaseRef.notFoundSuffix")}</> : <>{t("ui2g5.workspaceBaseRef.cantUsePrefix")}<code className="font-mono">{requestedRef}</code></>}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {repairedBranch
              ? <>{t("ui2g5.workspaceBaseRef.startsFrom")}<code className="font-mono text-foreground">{repairedBranch}</code>{t("ui2g5.workspaceBaseRef.retryRequested", { agent: agentName })}</>
              : <><span className="break-all text-foreground">{repository}</span>{failureKind === "missing_branch" ? <>{t("ui2g5.workspaceBaseRef.noBranchNamed")}<code className="font-mono text-foreground">{requestedRef}</code>.</> : t("ui2g5.workspaceBaseRef.couldNotResolve")} {t("ui2g5.workspaceBaseRef.agentNotStarted", { agent: agentName })}</>}
          </p>
        </div>
        {!repairedBranch && (
          <>
            {defaultBranch && !editing && <p className="flex flex-wrap items-center gap-1.5 text-sm"><GitBranch aria-hidden className="size-4 text-muted-foreground" /><code className="font-mono">{defaultBranch}</code><span className="text-muted-foreground">{t("ui2g5.workspaceBaseRef.defaultBranchNote")}</span></p>}
            <p className="text-xs text-muted-foreground">{t("ui2g5.workspaceBaseRef.changesOnly")}</p>
            {unavailableReason && <p id={`${id}-unavailable`} className="text-sm text-muted-foreground">{unavailableReason}</p>}
            {error && <p role="alert" id={`${id}-error`} className="text-sm text-destructive">{t("ui2g5.workspaceBaseRef.confirmFailed", { error })}</p>}
            {editing ? (
              <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); void repair(branch); }}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-branch`}>{t("ui2g5.workspaceBaseRef.startingBranch")}</Label>
                  <Input id={`${id}-branch`} autoFocus value={branch} disabled={pending || Boolean(unavailableReason)} onChange={event => setBranch(event.target.value)} placeholder={t("ui2g5.workspaceBaseRef.branchNamePlaceholder")} className="font-mono" aria-describedby={error ? `${id}-error` : undefined} autoComplete="off" spellCheck={false} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {defaultBranch ? <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => { setEditing(false); setError(null); }}>{t("ui2g5.workspaceBaseRef.cancel")}</Button> : <span />}
                  <Button type="submit" size="sm" disabled={pending || !changed || Boolean(unavailableReason)} aria-describedby={unavailableReason ? `${id}-unavailable` : undefined}>
                    {pending && <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />}{pending ? t("ui2g5.workspaceBaseRef.saving") : t("ui2g5.workspaceBaseRef.saveAndRetry")}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={pending || Boolean(unavailableReason)} onClick={() => setEditing(true)}>{t("ui2g5.workspaceBaseRef.chooseAnother")}</Button>
                <Button type="button" size="sm" disabled={pending || Boolean(unavailableReason) || defaultBranch === requestedRef} aria-describedby={unavailableReason ? `${id}-unavailable` : undefined} onClick={() => void repair(defaultBranch!)}>
                  {pending && <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />}{pending ? t("ui2g5.workspaceBaseRef.saving") : t("ui2g5.workspaceBaseRef.useBranchAndRetry", { branch: defaultBranch })}
                </Button>
              </div>
            )}
          </>
        )}
        <div>
          <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" aria-expanded={details} aria-controls={`${id}-details`} onClick={() => setDetails(value => !value)}>
            {details ? t("ui2g5.workspaceBaseRef.hideDetails") : t("ui2g5.workspaceBaseRef.whyHappened")}<ChevronDown aria-hidden className={cn("size-3", details && "rotate-180")} />
          </Button>
          {details && <div id={`${id}-details`} className="mt-2 rounded-md border border-border bg-background">
            <SystemNoticeMetadataSections tone="neutral" sections={[{ rows: [
              { kind: "text", label: t("ui2g5.workspaceBaseRef.setting"), value: taskOverride ? t("ui2g5.workspaceBaseRef.taskBranch") : t("ui2g5.workspaceBaseRef.workspaceBranch") },
              { kind: "code", label: t("ui2g5.workspaceBaseRef.requestedBranch"), value: requestedRef },
              ...(configuredBy ? [{ kind: "text" as const, label: t("ui2g5.workspaceBaseRef.setBy"), value: configuredBy }] : []),
              { kind: "text", label: t("ui2g5.workspaceBaseRef.whyStopped"), value: taskOverride ? t("ui2g5.workspaceBaseRef.explicitBranch") : t("ui2g5.workspaceBaseRef.resolveFirst") },
            ] }]} />
          </div>}
        </div>
      </div>
    </section>
  );
}
