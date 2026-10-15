import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ExecutionBlocker, Issue } from "@paperclipai/shared";
import { issuesApi } from "../api/issues";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { useTranslation } from "@/i18n";

export function WorkspaceFileRecovery({ issueId, issueStatus, blocker, canManage, onRecorded }: {
  issueId: string;
  issueStatus: Issue["status"];
  blocker: ExecutionBlocker;
  canManage: boolean;
  onRecorded: () => void;
}) {
  const { t } = useTranslation();
  const noteId = useId();
  const confirmationId = useId();
  const [evidence, setEvidence] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const record = useMutation({
    mutationFn: () => issuesApi.resolveRecoveryAction(issueId, {
      actionId: blocker.recoveryActionId!, outcome: "restored", sourceIssueStatus: issueStatus,
      resolutionNote: evidence.trim(),
      executionReconciliation: {
        runId: blocker.runId!, providerStopped: true, actionOutcome: "mixed",
        outcomeEvidence: "This request records recovered workspace files only. It does not replay the source run or certify its external action outcomes.",
        workspaceRepairEvidence: evidence.trim(),
      },
    }),
    onSuccess: onRecorded,
  });
  if (!blocker.workspaceRepairRequired || !blocker.canRecordWorkspaceRepair ||
    !["legacy_execution_requires_reconciliation", "native_continuation_requires_reconciliation"].includes(blocker.cause)
    || !blocker.recoveryActionId || !blocker.runId) return null;
  return <section aria-label={t("ui2g3.workspaceFileRecovery.sectionLabel")} className="flex w-full flex-col gap-2">
    {record.isSuccess ? <p role="status">{t("ui2g3.workspaceFileRecovery.recorded")}</p>
      : canManage ? <>
        <Label htmlFor={noteId}>{t("ui2g3.workspaceFileRecovery.evidenceLabel")}</Label>
        <Textarea id={noteId} value={evidence} onChange={event => setEvidence(event.target.value)} maxLength={12_000}
          placeholder={t("ui2g3.workspaceFileRecovery.evidencePlaceholder")}
          disabled={record.isPending} />
        <div className="flex items-center gap-2">
          <Checkbox id={confirmationId} checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} disabled={record.isPending} />
          <Label htmlFor={confirmationId}>{t("ui2g3.workspaceFileRecovery.confirmation")}</Label>
        </div>
        <p className="text-muted-foreground">{t("ui2g3.workspaceFileRecovery.explanation")}</p>
        <div className="flex justify-end">
          <Button disabled={record.isPending || !confirmed || evidence.trim().length < 20} onClick={() => record.mutate()}>
            {record.isPending ? t("ui2g3.workspaceFileRecovery.recording") : t("ui2g3.workspaceFileRecovery.record")}
          </Button>
        </div>
        {record.isError && <p role="alert" className="text-destructive">{record.error.message}</p>}
      </> : <p className="text-muted-foreground">{t("ui2g3.workspaceFileRecovery.noAccess")}</p>}
  </section>;
}
