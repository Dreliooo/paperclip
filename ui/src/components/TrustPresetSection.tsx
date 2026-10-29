import { useEffect, useMemo, useState } from "react";
import type { AgentPermissions, TrustPreset } from "@paperclipai/shared";
import { Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, CollapsibleSection } from "./agent-config-primitives";
import {
  buildPermissionsForTrustPreset,
  clearSingleLowTrustBoundaryTarget,
  getLowTrustBoundary,
  getSingleLowTrustBoundaryTarget,
  getTrustPreset,
  isCeLowTrustBoundaryEditable,
  lowTrustBoundaryHasScope,
  setSingleLowTrustBoundaryTarget,
  summarizeLowTrustBoundaryTarget,
  TRUST_PRESET_DESCRIPTIONS,
  TRUST_PRESET_LABELS,
  type LowTrustBoundaryTarget,
} from "../lib/trust-policy-ui";
import { cn } from "../lib/utils";
import { t as translate, useTranslation } from "@/i18n";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

/** `countKey` is a plural key with `_one` / `_other` forms. */
function formatCount(value: readonly unknown[] | undefined, countKey: string) {
  const count = value?.length ?? 0;
  if (count === 0) return "-";
  return translate(countKey, { count });
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 text-right", value === "-" && "text-muted-foreground")}>{value}</span>
    </div>
  );
}

export interface LowTrustBoundaryCandidate {
  id: string;
  label: string;
}

type LowTrustBoundaryTargetType = LowTrustBoundaryTarget["type"];

const BOUNDARY_TARGET_LABEL_KEYS: Record<LowTrustBoundaryTargetType, string> = {
  project: "ui2g4.trustPresetSection.targetProject",
  root_issue: "ui2g4.trustPresetSection.targetRootIssue",
  issue: "ui2g4.trustPresetSection.targetIssue",
};

export function TrustPresetSection({
  permissions,
  onChange,
  disabled,
  companyId,
  projectCandidates = [],
  issueCandidates = [],
  candidatesLoading,
  allowSingleIssue = true,
}: {
  permissions: Partial<AgentPermissions> | null | undefined;
  onChange: (permissions: Partial<AgentPermissions>) => void;
  disabled?: boolean;
  companyId?: string | null;
  projectCandidates?: LowTrustBoundaryCandidate[];
  issueCandidates?: LowTrustBoundaryCandidate[];
  candidatesLoading?: boolean;
  allowSingleIssue?: boolean;
}) {
  const { t } = useTranslation();
  const [policyOpen, setPolicyOpen] = useState(false);
  const preset = getTrustPreset(permissions);
  const boundary = getLowTrustBoundary(permissions);
  const boundaryTarget = getSingleLowTrustBoundaryTarget(boundary);
  const [targetType, setTargetType] = useState<LowTrustBoundaryTargetType>(boundaryTarget?.type ?? "project");
  const lowTrust = preset === "low_trust_review";
  const hasScope = lowTrustBoundaryHasScope(boundary);
  const boundaryEditable = isCeLowTrustBoundaryEditable(boundary);
  const policy = permissions?.authorizationPolicy ?? null;
  const managedPermissions = useMemo(
    () => buildPermissionsForTrustPreset(permissions, preset),
    [permissions, preset],
  );

  useEffect(() => {
    if (boundaryTarget) setTargetType(boundaryTarget.type);
  }, [boundaryTarget?.type]);

  function handlePresetChange(value: string) {
    const nextPreset: TrustPreset = value === "low_trust_review" ? "low_trust_review" : "standard";
    onChange(buildPermissionsForTrustPreset(permissions, nextPreset));
  }

  function handleBoundaryTargetChange(targetId: string) {
    if (!companyId || !targetId) return;
    onChange(setSingleLowTrustBoundaryTarget(permissions, companyId, { type: targetType, id: targetId }));
  }

  function handleClearBoundary() {
    onChange(clearSingleLowTrustBoundaryTarget(permissions));
  }

  const targetCandidates = targetType === "project" ? projectCandidates : issueCandidates;
  const boundaryValue = boundaryTarget?.type === targetType ? boundaryTarget.id : "";

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium">{t("ui2g4.trustPresetSection.trust")}</h3>
      <div className="rounded-lg border border-border p-4 space-y-3">
        <Field label={t("ui2g4.trustPresetSection.presetLabel")} hint={t("ui2g4.trustPresetSection.presetHint")}>
          <select
            className={inputClass}
            value={preset}
            onChange={(event) => handlePresetChange(event.target.value)}
            disabled={disabled}
          >
            <option value="standard">{TRUST_PRESET_LABELS.standard}</option>
            <option value="low_trust_review">{TRUST_PRESET_LABELS.low_trust_review}</option>
          </select>
        </Field>
        <p className="text-xs text-muted-foreground">{TRUST_PRESET_DESCRIPTIONS[preset]}</p>

        {lowTrust ? (
          <div
            role={hasScope ? "status" : "alert"}
            aria-live="polite"
            className={cn(
              "rounded-md border px-3 py-2.5 text-sm flex gap-2",
              hasScope
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-100"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {hasScope ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="font-medium">
                  {hasScope ? t("ui2g4.trustPresetSection.containmentActive") : t("ui2g4.trustPresetSection.containmentNotConfigured")}
                </p>
                <p className="mt-1 text-xs leading-5">
                  {hasScope
                    ? t("ui2g4.trustPresetSection.containmentActiveBody")
                    : t("ui2g4.trustPresetSection.containmentNotConfiguredBody")}
                </p>
              </div>
              {boundaryEditable ? (
                <div className="rounded-md border border-border/70 bg-background/70 p-3 text-foreground space-y-3">
                  <div className="grid gap-3 sm:grid-cols-(--gtc-12)">
                    <Field label={t("ui2g4.trustPresetSection.boundaryType")}>
                      <select
                        className={inputClass}
                        value={targetType}
                        onChange={(event) => setTargetType(event.target.value as LowTrustBoundaryTargetType)}
                        disabled={disabled}
                      >
                        <option value="project">{t("ui2g4.trustPresetSection.targetProject")}</option>
                        <option value="root_issue">{t("ui2g4.trustPresetSection.targetRootIssue")}</option>
                        {allowSingleIssue && <option value="issue">{t("ui2g4.trustPresetSection.targetIssue")}</option>}
                      </select>
                    </Field>
                    <Field label={t(BOUNDARY_TARGET_LABEL_KEYS[targetType])}>
                      <select
                        className={inputClass}
                        value={boundaryValue}
                        onChange={(event) => handleBoundaryTargetChange(event.target.value)}
                        disabled={disabled || !companyId || candidatesLoading || targetCandidates.length === 0}
                      >
                        <option value="">
                          {candidatesLoading
                            ? t("ui2g4.trustPresetSection.loading")
                            : targetCandidates.length === 0
                              ? (targetType === "project"
                                ? t("ui2g4.trustPresetSection.noProjectsAvailable")
                                : t("ui2g4.trustPresetSection.noIssuesAvailable"))
                              : t("ui2g4.trustPresetSection.selectBoundary")}
                        </option>
                        {targetCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {t("ui2g4.trustPresetSection.ceSavesOne")}
                    </p>
                    {boundaryTarget ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs"
                        onClick={handleClearBoundary}
                        disabled={disabled}
                      >
                        {t("ui2g4.trustPresetSection.clearBoundary")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-border/70 bg-background/70 p-3 text-foreground">
                  <p className="text-sm font-medium">{t("ui2g4.trustPresetSection.managedByEe")}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t("ui2g4.trustPresetSection.managedByEeBody", { summary: summarizeLowTrustBoundaryTarget(boundary).toLowerCase() })}
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t("ui2g4.trustPresetSection.wantMore")}{" "}
                <a
                  className="underline underline-offset-2 hover:text-foreground"
                  href="https://paperclip.ing/ee"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("ui2g4.trustPresetSection.getEe")}
                </a>
              </p>
              <CollapsibleSection
                title={t("ui2g4.trustPresetSection.viewPolicy")}
                open={policyOpen}
                onToggle={() => setPolicyOpen((open) => !open)}
              >
                <div className="divide-y divide-border/60 text-foreground">
                  <PolicyRow label={t("ui2g4.trustPresetSection.rowPreset")} value={t("ui2g4.trustPresetSection.lowTrustV1")} />
                  <PolicyRow label={t("ui2g4.trustPresetSection.rowRawOutput")} value={t("ui2g4.trustPresetSection.quarantined")} />
                  <PolicyRow label={t("ui2g4.trustPresetSection.rowProjects")} value={formatCount(boundary?.projectIds, "ui2g4.trustPresetSection.projectCount")} />
                  <PolicyRow label={t("ui2g4.trustPresetSection.rowRootIssue")} value={boundary?.rootIssueId ? boundary.rootIssueId.slice(0, 8) : "-"} />
                  <PolicyRow label={t("ui2g4.trustPresetSection.rowExplicitIssues")} value={formatCount(boundary?.issueIds, "ui2g4.trustPresetSection.issueCount")} />
                  <PolicyRow label={t("ui2g4.trustPresetSection.rowAllowedAgents")} value={formatCount(boundary?.allowedAgentIds, "ui2g4.trustPresetSection.agentCount")} />
                  <PolicyRow label={t("ui2g4.trustPresetSection.rowAllowedTools")} value={boundary?.allowedToolClasses?.join(" · ") || "-"} />
                  <PolicyRow label={t("ui2g4.trustPresetSection.rowAllowedSecrets")} value={formatCount(boundary?.allowedSecretBindingIds, "ui2g4.trustPresetSection.bindingCount")} />
                  <PolicyRow label={t("ui2g4.trustPresetSection.rowPromotionTarget")} value={boundary?.outputPromotionTarget?.issueId?.slice(0, 8) ?? "-"} />
                  <PolicyRow
                    label={t("ui2g4.trustPresetSection.rowEeFields")}
                    value={Object.keys(policy ?? {}).some((key) => !["trustPreset", "reviewPreset", "trustBoundary"].includes(key))
                      ? t("ui2g4.trustPresetSection.customPolicyFields")
                      : "-"}
                  />
                </div>
              </CollapsibleSection>
            </div>
          </div>
        ) : null}

        {managedPermissions.authorizationPolicy?.reviewPreset ? null : (
          <p className="text-xs text-muted-foreground">
            {t("ui2g4.trustPresetSection.advancedPermissions")}
          </p>
        )}
      </div>
    </div>
  );
}
