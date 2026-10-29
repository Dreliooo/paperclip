import { useTranslation } from "@/i18n";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FlaskConical, Lock, Play } from "lucide-react";
import type {
  InstanceExperimentalSettings,
  InstanceExperimentalSettingsWithManaged,
  InstanceFeatureKey,
  ManagedSettingMetadata,
  PatchInstanceExperimentalSettings,
} from "@paperclipai/shared";
import { experimentalSettingKey } from "@paperclipai/shared";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { useHiddenSettings } from "@/hooks/useHiddenSettings";
import { getWorktreeInstanceId, isWorktreeRuntime } from "../lib/worktree-branding";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/lib/router";

type WorktreeRunExecutionDisplayState =
  | { kind: "off" }
  | { kind: "armed"; activatedAt: string }
  | { kind: "fail_closed"; reason: "missing_cutoff" | "missing_instance_id" | "instance_mismatch" };

/**
 * Mirror of the server's `resolveWorktreeRunExecutionActivation` fail-closed
 * ladder (server/src/services/instance-settings.ts) so the card never claims a
 * copied/legacy row is arming execution. The derived fields are display-only —
 * the PATCH the toggle sends still writes just the boolean.
 */
function resolveWorktreeRunExecutionDisplayState(
  settings:
    | Pick<
        InstanceExperimentalSettings,
        | "enableWorktreeRunExecution"
        | "worktreeRunExecutionActivatedAt"
        | "worktreeRunExecutionActivationInstanceId"
      >
    | undefined,
  currentInstanceId: string | null,
): WorktreeRunExecutionDisplayState {
  if (settings?.enableWorktreeRunExecution !== true) return { kind: "off" };
  if (!settings.worktreeRunExecutionActivatedAt) return { kind: "fail_closed", reason: "missing_cutoff" };
  if (!currentInstanceId) return { kind: "fail_closed", reason: "missing_instance_id" };
  if (settings.worktreeRunExecutionActivationInstanceId !== currentInstanceId) {
    return { kind: "fail_closed", reason: "instance_mismatch" };
  }
  return { kind: "armed", activatedAt: settings.worktreeRunExecutionActivatedAt };
}

function formatActivationTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// PAP-11233: keep Conference Room code intact, but hide the user-facing opt-in for now.
const SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING = false;

function ManagedByCloudBadge() {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Lock aria-hidden="true" />
      {t("ui3g4.instanceExperimentalSettings.managedByCloud")}
    </Badge>
  );
}

function ExperimentalToggleCard({
  title,
  description,
  footnote,
  checked,
  onCheckedChange,
  disabled,
  settingKey,
  managed,
  ariaLabel,
}: {
  title: string;
  description: string;
  footnote?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
  /** Flag key backing this card; operator-hidden keys render nothing. */
  settingKey: InstanceFeatureKey;
  managed?: ManagedSettingMetadata;
  ariaLabel: string;
}) {
  const { hidden: hiddenSettings } = useHiddenSettings();
  const isManaged = managed?.managed === true;
  if (hiddenSettings.has(experimentalSettingKey(settingKey))) return null;
  return (
    <Card className="block bg-transparent p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {isManaged ? <ManagedByCloudBadge /> : null}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          {footnote ? <p className="max-w-2xl text-xs text-muted-foreground">{footnote}</p> : null}
        </div>
        <ToggleSwitch
          checked={checked}
          onCheckedChange={(next) => {
            if (isManaged) return;
            onCheckedChange(next);
          }}
          disabled={disabled || isManaged}
          aria-label={ariaLabel}
        />
      </div>
    </Card>
  );
}

export function InstanceExperimentalSettings() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { hidden: hiddenSettings } = useHiddenSettings();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("ui3g4.instanceExperimentalSettings.breadcrumbSettings"), href: "/company/settings" },
      { label: t("ui3g4.instanceExperimentalSettings.breadcrumbExperimental") },
    ]);
  }, [setBreadcrumbs, t]);

  const experimentalQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });

  const toggleMutation = useMutation<
    InstanceExperimentalSettingsWithManaged,
    Error,
    PatchInstanceExperimentalSettings,
    { previousSettings?: InstanceExperimentalSettingsWithManaged }
  >({
    mutationFn: async (patch: PatchInstanceExperimentalSettings) =>
      instanceSettingsApi.updateExperimental(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.instance.experimentalSettings });
      const previousSettings = queryClient.getQueryData<InstanceExperimentalSettingsWithManaged>(
        queryKeys.instance.experimentalSettings,
      );
      if (previousSettings) {
        queryClient.setQueryData<InstanceExperimentalSettingsWithManaged>(
          queryKeys.instance.experimentalSettings,
          { ...previousSettings, ...patch },
        );
      }
      return { previousSettings };
    },
    onSuccess: async (updatedSettings) => {
      setActionError(null);
      queryClient.setQueryData(queryKeys.instance.experimentalSettings, updatedSettings);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adapters.all }),
        queryClient.invalidateQueries({ queryKey: ["built-in-agents"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
        queryClient.invalidateQueries({ queryKey: ["apps"] }),
      ]);
    },
    onError: (error, _patch, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.instance.experimentalSettings, context.previousSettings);
      }
      setActionError(error instanceof Error ? error.message : t("ui3g4.instanceExperimentalSettings.updateError"));
    },
  });

  if (experimentalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("ui3g4.instanceExperimentalSettings.loading")}</div>;
  }

  if (experimentalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {experimentalQuery.error instanceof Error
          ? experimentalQuery.error.message
          : t("ui3g4.instanceExperimentalSettings.loadError")}
      </div>
    );
  }

  const inWorktree = isWorktreeRuntime();
  // Present only on cloud-managed instances: keys the managed overlay controls
  // render locked with the "Managed by Paperclip Cloud" badge. Self-hosted
  // responses carry no `managedKeys`, so every card stays editable.
  const managedKeys = experimentalQuery.data?.managedKeys ?? {};
  const enableWorktreeRunExecution = experimentalQuery.data?.enableWorktreeRunExecution === true;
  const worktreeRunExecutionManaged = managedKeys.enableWorktreeRunExecution?.managed === true;
  const worktreeRunExecutionState = resolveWorktreeRunExecutionDisplayState(
    experimentalQuery.data,
    getWorktreeInstanceId(),
  );
  const enableEnvironments = experimentalQuery.data?.enableEnvironments === true;
  const enableNativeRunner = experimentalQuery.data?.enableNativeRunner === true;
  const enableChatConnectors = experimentalQuery.data?.enableChatConnectors === true;
  const enableManagedSandboxOnly = experimentalQuery.data?.enableManagedSandboxOnly === true;
  const enableIsolatedWorkspaces = experimentalQuery.data?.enableIsolatedWorkspaces === true;
  const enableIsolatedWorkspacesByDefault =
    experimentalQuery.data?.enableIsolatedWorkspacesByDefault === true;
  // Streamlined left navigation is now the standard sidebar (PAP-12472); the
  // experimental opt-out was retired, so it no longer surfaces a toggle here.
  const enableStreamlinedUi = experimentalQuery.data?.enableStreamlinedUi !== false;
  const enableConferenceRoomChat = experimentalQuery.data?.enableConferenceRoomChat === true;
  const enableClassicTaskInterface = experimentalQuery.data?.enableClassicTaskInterface === true;
  const enableIssuePlanDecompositions =
    experimentalQuery.data?.enableIssuePlanDecompositions === true;
  const enableExperimentalFileViewer =
    experimentalQuery.data?.enableExperimentalFileViewer === true;
  const enableExternalObjects = experimentalQuery.data?.enableExternalObjects === true;
  const enableBuiltInAgents = experimentalQuery.data?.enableBuiltInAgents === true;
  const enableBetaSkills = experimentalQuery.data?.enableBetaSkills === true;
  const enableSummaries = experimentalQuery.data?.enableSummaries === true;
  const enableStatusCards = experimentalQuery.data?.enableStatusCards === true;
  const summariesManaged = managedKeys.enableSummaries?.managed === true;
  const statusCardsManaged = managedKeys.enableStatusCards?.managed === true;
  const statusCardsBlockedByManagedSummaries = summariesManaged && !enableSummaries;
  const summariesRequiredByManagedStatusCards = statusCardsManaged && enableStatusCards;
  const enableDecisions = experimentalQuery.data?.enableDecisions === true;
  const enableGoalsSidebarLink = experimentalQuery.data?.enableGoalsSidebarLink === true;
  const enableCases = experimentalQuery.data?.enableCases === true;
  const enableServerInfoDebugView = experimentalQuery.data?.enableServerInfoDebugView === true;
  const enablePaperclipDeveloperMode =
    experimentalQuery.data?.enablePaperclipDeveloperMode === true;
  const enableSimplifiedEnglishInteractions =
    experimentalQuery.data?.enableSimplifiedEnglishInteractions === true;
  const enableFirstTaskPlanProposal =
    experimentalQuery.data?.enableFirstTaskPlanProposal === true;
  const enableSmokeLab = experimentalQuery.data?.enableSmokeLab === true;
  const autoRestartDevServerWhenIdle = experimentalQuery.data?.autoRestartDevServerWhenIdle === true;
  const isVisible = (key: InstanceFeatureKey) => !hiddenSettings.has(experimentalSettingKey(key));
  const showWorktreeRunExecution = inWorktree && isVisible("enableWorktreeRunExecution");
  const showDeveloperSection = showWorktreeRunExecution || ([
    "autoRestartDevServerWhenIdle",
    "enableManagedSandboxOnly",
    "enablePaperclipDeveloperMode",
    "enableServerInfoDebugView",
    "enableSmokeLab",
    "enableIssuePlanDecompositions",
  ] satisfies InstanceFeatureKey[]).some(isVisible);
  const showLegacySection = isVisible("enableClassicTaskInterface") || isVisible("enableGoalsSidebarLink");
  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("ui3g4.instanceExperimentalSettings.heading")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("ui3g4.instanceExperimentalSettings.intro")}
        </p>
      </div>

      <div
        role="alert"
        className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">{t("ui3g4.instanceExperimentalSettings.alertTitle")}</p>
            <p className="text-muted-foreground">
              {t("ui3g4.instanceExperimentalSettings.alertBody")}
            </p>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <section className="space-y-3" aria-labelledby="experimental-features-heading">
        <div className="space-y-1">
          <h2 id="experimental-features-heading" className="text-sm font-semibold">
            {t("ui3g4.instanceExperimentalSettings.featuresHeading")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("ui3g4.instanceExperimentalSettings.featuresIntro")}
          </p>
        </div>

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableAgentChat.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableAgentChat.description")}
          footnote={t("ui3g4.instanceExperimentalSettings.cards.enableAgentChat.footnote")}
          checked={experimentalQuery.data?.enableAgentChat ?? false}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableAgentChat: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableAgentChat"
          managed={managedKeys.enableAgentChat}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableAgentChat.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enablePublicMcp.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enablePublicMcp.description")}
          footnote={<>{t("ui3g4.instanceExperimentalSettings.publicMcpFootnote")}{experimentalQuery.data?.enablePublicMcp && <> <Link className="underline" to="/apps/assistant-connection">{t("ui3g4.instanceExperimentalSettings.publicMcpSetupLink")}</Link></>}</>}
          checked={experimentalQuery.data?.enablePublicMcp === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enablePublicMcp: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enablePublicMcp"
          managed={managedKeys.enablePublicMcp}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enablePublicMcp.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableBetaSkills.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableBetaSkills.description")}
          checked={enableBetaSkills}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableBetaSkills: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableBetaSkills"
          managed={managedKeys.enableBetaSkills}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableBetaSkills.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableBuiltInAgents.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableBuiltInAgents.description")}
          checked={enableBuiltInAgents}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableBuiltInAgents: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableBuiltInAgents"
          managed={managedKeys.enableBuiltInAgents}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableBuiltInAgents.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableCases.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableCases.description")}
          footnote={t("ui3g4.instanceExperimentalSettings.cards.enableCases.footnote")}
          checked={enableCases}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableCases: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableCases"
          managed={managedKeys.enableCases}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableCases.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableChatConnectors.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableChatConnectors.description")}
          footnote={t("ui3g4.instanceExperimentalSettings.cards.enableChatConnectors.footnote")}
          checked={enableChatConnectors}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableChatConnectors: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableChatConnectors"
          managed={managedKeys.enableChatConnectors}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableChatConnectors.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableCombinedInboxTasks.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableCombinedInboxTasks.description")}
          footnote={t("ui3g4.instanceExperimentalSettings.cards.enableCombinedInboxTasks.footnote")}
          checked={experimentalQuery.data?.enableCombinedInboxTasks ?? false}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableCombinedInboxTasks: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableCombinedInboxTasks"
          managed={managedKeys.enableCombinedInboxTasks}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableCombinedInboxTasks.ariaLabel")}
        />

        {SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING ? (
          <ExperimentalToggleCard
            title={t("ui3g4.instanceExperimentalSettings.cards.enableConferenceRoomChat.title")}
            description={t("ui3g4.instanceExperimentalSettings.cards.enableConferenceRoomChat.description")}
            checked={enableConferenceRoomChat}
            onCheckedChange={(checked) => toggleMutation.mutate({ enableConferenceRoomChat: checked })}
            disabled={toggleMutation.isPending}
            settingKey="enableConferenceRoomChat"
            managed={managedKeys.enableConferenceRoomChat}
            ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableConferenceRoomChat.ariaLabel")}
          />
        ) : null}

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableDecisions.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableDecisions.description")}
          checked={enableDecisions}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableDecisions: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableDecisions"
          managed={managedKeys.enableDecisions}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableDecisions.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableEnvironments.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableEnvironments.description")}
          checked={enableEnvironments}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableEnvironments: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableEnvironments"
          managed={managedKeys.enableEnvironments}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableEnvironments.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableExternalObjects.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableExternalObjects.description")}
          checked={enableExternalObjects}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableExternalObjects: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableExternalObjects"
          managed={managedKeys.enableExternalObjects}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableExternalObjects.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableIsolatedWorkspaces.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableIsolatedWorkspaces.description")}
          checked={enableIsolatedWorkspaces}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableIsolatedWorkspaces: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableIsolatedWorkspaces"
          managed={managedKeys.enableIsolatedWorkspaces}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableIsolatedWorkspaces.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableFastResponses.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableFastResponses.description")}
          checked={experimentalQuery.data?.enableFastResponses ?? false}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableFastResponses: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableFastResponses"
          managed={managedKeys.enableFastResponses}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableFastResponses.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableExperimentalFileViewer.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableExperimentalFileViewer.description")}
          checked={enableExperimentalFileViewer}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableExperimentalFileViewer: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableExperimentalFileViewer"
          managed={managedKeys.enableExperimentalFileViewer}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableExperimentalFileViewer.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableFirstTaskPlanProposal.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableFirstTaskPlanProposal.description")}
          checked={enableFirstTaskPlanProposal}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableFirstTaskPlanProposal: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableFirstTaskPlanProposal"
          managed={managedKeys.enableFirstTaskPlanProposal}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableFirstTaskPlanProposal.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableGitHubReviewBots.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableGitHubReviewBots.description")}
          footnote={t("ui3g4.instanceExperimentalSettings.cards.enableGitHubReviewBots.footnote")}
          checked={experimentalQuery.data?.enableGitHubReviewBots === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableGitHubReviewBots: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableGitHubReviewBots"
          managed={managedKeys.enableGitHubReviewBots}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableGitHubReviewBots.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableGrokBot.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableGrokBot.description")}
          footnote={t("ui3g4.instanceExperimentalSettings.cards.enableGrokBot.footnote")}
          checked={experimentalQuery.data?.enableGrokBot === true}
          onCheckedChange={checked => toggleMutation.mutate({ enableGrokBot: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableGrokBot" managed={managedKeys.enableGrokBot}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableGrokBot.ariaLabel")}
        />


        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableMemoryConnectors.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableMemoryConnectors.description")}
          footnote={t("ui3g4.instanceExperimentalSettings.cards.enableMemoryConnectors.footnote")}
          checked={experimentalQuery.data?.enableMemoryConnectors === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableMemoryConnectors: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableMemoryConnectors"
          managed={managedKeys.enableMemoryConnectors}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableMemoryConnectors.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableOpenAiDot.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableOpenAiDot.description")}
          footnote={t("ui3g4.instanceExperimentalSettings.cards.enableOpenAiDot.footnote")}
          checked={experimentalQuery.data?.enableOpenAiDot === true}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableOpenAiDot: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableOpenAiDot"
          managed={managedKeys.enableOpenAiDot}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableOpenAiDot.ariaLabel")}
        />


        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableNativeRunner.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableNativeRunner.description")}
          checked={enableNativeRunner}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableNativeRunner: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableNativeRunner"
          managed={managedKeys.enableNativeRunner}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableNativeRunner.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableSimplifiedEnglishInteractions.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableSimplifiedEnglishInteractions.description")}
          checked={enableSimplifiedEnglishInteractions}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableSimplifiedEnglishInteractions: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableSimplifiedEnglishInteractions"
          managed={managedKeys.enableSimplifiedEnglishInteractions}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableSimplifiedEnglishInteractions.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableStatusCards.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableStatusCards.description")}
          footnote={t("ui3g4.instanceExperimentalSettings.cards.enableStatusCards.footnote")}
          checked={enableStatusCards}
          onCheckedChange={(checked) =>
            toggleMutation.mutate(
              checked
                ? { enableSummaries: true, enableStatusCards: true }
                : { enableStatusCards: false },
            )
          }
          disabled={toggleMutation.isPending || statusCardsBlockedByManagedSummaries}
          settingKey="enableStatusCards"
          managed={managedKeys.enableStatusCards}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableStatusCards.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableStreamlinedUi.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableStreamlinedUi.description")}
          footnote={t("ui3g4.instanceExperimentalSettings.cards.enableStreamlinedUi.footnote")}
          checked={enableStreamlinedUi}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableStreamlinedUi: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableStreamlinedUi"
          managed={managedKeys.enableStreamlinedUi}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableStreamlinedUi.ariaLabel")}
        />

        <ExperimentalToggleCard
          title={t("ui3g4.instanceExperimentalSettings.cards.enableSummaries.title")}
          description={t("ui3g4.instanceExperimentalSettings.cards.enableSummaries.description")}
          footnote={t("ui3g4.instanceExperimentalSettings.cards.enableSummaries.footnote")}
          checked={enableSummaries}
          onCheckedChange={(checked) =>
            toggleMutation.mutate(
              checked || !enableStatusCards
                ? { enableSummaries: checked }
                : { enableSummaries: false, enableStatusCards: false },
            )
          }
          disabled={toggleMutation.isPending || summariesRequiredByManagedStatusCards}
          settingKey="enableSummaries"
          managed={managedKeys.enableSummaries}
          ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableSummaries.ariaLabel")}
        />

        {enableIsolatedWorkspaces && (
          <ExperimentalToggleCard
            title={t("ui3g4.instanceExperimentalSettings.cards.enableIsolatedWorkspacesByDefault.title")}
            description={t("ui3g4.instanceExperimentalSettings.cards.enableIsolatedWorkspacesByDefault.description")}
            checked={enableIsolatedWorkspacesByDefault}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableIsolatedWorkspacesByDefault: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableIsolatedWorkspacesByDefault"
            managed={managedKeys.enableIsolatedWorkspacesByDefault}
            ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableIsolatedWorkspacesByDefault.ariaLabel")}
          />
        )}
      </section>

      {showDeveloperSection ? (
        <section className="space-y-3" aria-labelledby="developer-mode-heading">
          <div className="space-y-1">
            <h2 id="developer-mode-heading" className="text-sm font-semibold">
              {t("ui3g4.instanceExperimentalSettings.devHeading")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("ui3g4.instanceExperimentalSettings.devIntro")}
            </p>
          </div>

          <ExperimentalToggleCard
            title={t("ui3g4.instanceExperimentalSettings.cards.autoRestartDevServerWhenIdle.title")}
            description={t("ui3g4.instanceExperimentalSettings.cards.autoRestartDevServerWhenIdle.description")}
            checked={autoRestartDevServerWhenIdle}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ autoRestartDevServerWhenIdle: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="autoRestartDevServerWhenIdle"
            managed={managedKeys.autoRestartDevServerWhenIdle}
            ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.autoRestartDevServerWhenIdle.ariaLabel")}
          />

          <ExperimentalToggleCard
            title={t("ui3g4.instanceExperimentalSettings.cards.enableManagedSandboxOnly.title")}
            description={t("ui3g4.instanceExperimentalSettings.cards.enableManagedSandboxOnly.description")}
            checked={enableManagedSandboxOnly}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableManagedSandboxOnly: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableManagedSandboxOnly"
            managed={managedKeys.enableManagedSandboxOnly}
            ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableManagedSandboxOnly.ariaLabel")}
          />

          <ExperimentalToggleCard
            title={t("ui3g4.instanceExperimentalSettings.cards.enablePaperclipDeveloperMode.title")}
            description={t("ui3g4.instanceExperimentalSettings.cards.enablePaperclipDeveloperMode.description")}
            checked={enablePaperclipDeveloperMode}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enablePaperclipDeveloperMode: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enablePaperclipDeveloperMode"
            managed={managedKeys.enablePaperclipDeveloperMode}
            ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enablePaperclipDeveloperMode.ariaLabel")}
          />

          {showWorktreeRunExecution ? (
            <Card className="block bg-transparent p-5">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{t("ui3g4.instanceExperimentalSettings.worktree.title")}</h3>
                      {worktreeRunExecutionManaged ? <ManagedByCloudBadge /> : null}
                    </div>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      {t("ui3g4.instanceExperimentalSettings.worktree.description")}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={enableWorktreeRunExecution}
                    onCheckedChange={(checked) => {
                      if (worktreeRunExecutionManaged) return;
                      toggleMutation.mutate({ enableWorktreeRunExecution: checked });
                    }}
                    disabled={toggleMutation.isPending || worktreeRunExecutionManaged}
                    aria-label={t("ui3g4.instanceExperimentalSettings.worktree.ariaLabel")}
                  />
                </div>

                {worktreeRunExecutionState.kind === "armed" ? (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-foreground">
                    <Play className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      {t("ui3g4.instanceExperimentalSettings.worktree.armedBefore")}{" "}
                      <span className="font-medium">
                        {formatActivationTimestamp(worktreeRunExecutionState.activatedAt)}
                      </span>
                      .
                    </span>
                  </div>
                ) : null}

                {worktreeRunExecutionState.kind === "fail_closed" ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">{t("ui3g4.instanceExperimentalSettings.worktree.failedTitle")}</p>
                      <p className="text-muted-foreground">
                        {worktreeRunExecutionState.reason === "instance_mismatch"
                          ? t("ui3g4.instanceExperimentalSettings.worktree.mismatch")
                          : t("ui3g4.instanceExperimentalSettings.worktree.missingCutoff")}{" "}
                        {t("ui3g4.instanceExperimentalSettings.worktree.toggleOffOn")}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          <ExperimentalToggleCard
            title={t("ui3g4.instanceExperimentalSettings.cards.enableServerInfoDebugView.title")}
            description={t("ui3g4.instanceExperimentalSettings.cards.enableServerInfoDebugView.description")}
            checked={enableServerInfoDebugView}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableServerInfoDebugView: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableServerInfoDebugView"
            managed={managedKeys.enableServerInfoDebugView}
            ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableServerInfoDebugView.ariaLabel")}
          />

          <ExperimentalToggleCard
            title={t("ui3g4.instanceExperimentalSettings.cards.enableSmokeLab.title")}
            description={t("ui3g4.instanceExperimentalSettings.cards.enableSmokeLab.description")}
            checked={enableSmokeLab}
            onCheckedChange={(checked) => toggleMutation.mutate({ enableSmokeLab: checked })}
            disabled={toggleMutation.isPending}
            settingKey="enableSmokeLab"
            managed={managedKeys.enableSmokeLab}
            ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableSmokeLab.ariaLabel")}
          />

          <ExperimentalToggleCard
            title={t("ui3g4.instanceExperimentalSettings.cards.enableIssuePlanDecompositions.title")}
            description={t("ui3g4.instanceExperimentalSettings.cards.enableIssuePlanDecompositions.description")}
            checked={enableIssuePlanDecompositions}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableIssuePlanDecompositions: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableIssuePlanDecompositions"
            managed={managedKeys.enableIssuePlanDecompositions}
            ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableIssuePlanDecompositions.ariaLabel")}
          />
        </section>
      ) : null}

      {showLegacySection ? (
        <section className="space-y-3" aria-labelledby="legacy-heading">
          <div className="space-y-1">
            <h2 id="legacy-heading" className="text-sm font-semibold">
              {t("ui3g4.instanceExperimentalSettings.legacyHeading")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("ui3g4.instanceExperimentalSettings.legacyIntro")}</p>
          </div>

          <ExperimentalToggleCard
            title={t("ui3g4.instanceExperimentalSettings.cards.enableClassicTaskInterface.title")}
            description={t("ui3g4.instanceExperimentalSettings.cards.enableClassicTaskInterface.description")}
            footnote={t("ui3g4.instanceExperimentalSettings.cards.enableClassicTaskInterface.footnote")}
            checked={enableClassicTaskInterface}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableClassicTaskInterface: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableClassicTaskInterface"
            managed={managedKeys.enableClassicTaskInterface}
            ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableClassicTaskInterface.ariaLabel")}
          />

          <ExperimentalToggleCard
            title={t("ui3g4.instanceExperimentalSettings.cards.enableGoalsSidebarLink.title")}
            description={t("ui3g4.instanceExperimentalSettings.cards.enableGoalsSidebarLink.description")}
            checked={enableGoalsSidebarLink}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ enableGoalsSidebarLink: checked })
            }
            disabled={toggleMutation.isPending}
            settingKey="enableGoalsSidebarLink"
            managed={managedKeys.enableGoalsSidebarLink}
            ariaLabel={t("ui3g4.instanceExperimentalSettings.cards.enableGoalsSidebarLink.ariaLabel")}
          />
        </section>
      ) : null}
    </div>
  );
}
