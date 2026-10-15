import { useTranslation } from "@/i18n";
import { SpekoProviderSetup } from "@/components/voice/SpekoProviderSetup";
import { NativeVoiceConversation } from "@/components/voice/NativeVoiceConversation";
import { buildSlackAppManifest, defaultSlackAppConfiguration } from "@paperclipai/shared";
import { SlackAppDetails, SlackSetupAdvanced } from "./SlackAppDetails";
import { SlackSetup } from "./slack/SlackSetup";
import { isProvisionedSlackSetup, slackSetupState } from "./slack/setup-state";
import { defaultSlackAppName } from "./slack-app-name";
import { GitHubChatSetup } from "./GitHubChatSetup";
import { GitHubAgentTrustWarning } from "@/components/GitHubAgentTrustWarning";
import { SetupWizardFooter } from "@/components/SetupWizard";
import { ChatSetupNavigation } from "@/components/chat/ChatSetupNavigation";
import { SlackIdentityStep } from "./SlackIdentityStep";
import { PhotonConnectStep } from "./PhotonConnectStep";
import { EmailEndpointSetup } from "./EmailEndpointSetup";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, CircleHelp, ExternalLink, Eye, EyeOff, Hammer, Loader2 } from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { AgentCharacter } from "@/components/AgentCharacter";
import { AgentSelect } from "@/components/AgentMultiSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { agentsApi } from "@/api/agents";
import { instanceSettingsApi } from "@/api/instanceSettings";
import {
  chatEndpointsApi,
  type ChatEndpoint,
  type ChatProvider,
  type ChatEndpointSetupAction,
} from "@/api/chatEndpoints";
import { useNavigate, useSearchParams } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useCopyAction } from "@/lib/use-copy-action";
import { isAgentStatusInvokable, slackAppConfigurationSchema, type SlackAppConfiguration } from "@paperclipai/shared";
import { sanitizedSetupErrorMessage } from "./chat-setup-error";
import {
  createGitHubPrivateKeyReadGuard,
  readGitHubPrivateKeyFile,
} from "./github-private-key-file";

const providerNames: Record<ChatProvider, string> = {
  speko: "Speko",
  agentmail: "AgentMail",
  slack: "Slack",
  github: "GitHub",
  discord: "Discord",
  "microsoft-teams": "Microsoft Teams",
  telegram: "Telegram",
  "imessage-photon": "iMessage Photon",
};

const knownProviders = new Set(Object.keys(providerNames));

function isProvider(value: string | null): value is ChatProvider {
  return value !== null && knownProviders.has(value);
}

function publicOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isChatEndpointRepairing(
  endpoint: Pick<
    ChatEndpoint,
    "provider" | "status" | "providerAccountId" | "botExternalId"
  > | null,
  resumeEndpointId: string | null,
  reconnectRequested: boolean,
): boolean {
  if (!resumeEndpointId || !endpoint) return false;
  const recoveringStatus =
    endpoint.status === "attention" || endpoint.status === "revoked";
  // A secret-only GitHub draft affected by setup trouble has no App identity
  // or reusable App credentials. It must remain first-time setup, where App ID
  // and private key are required, rather than offering a misleading reconnect.
  if (
    endpoint.provider === "github" &&
    recoveringStatus &&
    !endpoint.providerAccountId &&
    !endpoint.botExternalId
  ) {
    return false;
  }
  return (
    recoveringStatus ||
    (reconnectRequested &&
      (endpoint.status === "active" || endpoint.status === "paused"))
  );
}

export function ChatConnectionPurpose({ provider, onChat, onTools, slackLabels }: {
  provider: ChatProvider;
  onChat: () => void;
  onTools: () => void;
  slackLabels?: string[];
}) {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: t("ui3g7.chatEndpointSetup.connectors"), href: "/apps" }, { label: t("ui3g7.chatEndpointSetup.chooseConnection") }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);
  return (
      <div className="max-w-2xl space-y-6">
        <ChatSetupNavigation labels={provider === "slack" ? slackLabels ?? [t("ui3g7.chatEndpointSetup.chooseAgent"), t("ui3g7.chatEndpointSetup.connect")] : undefined} step={0} availableStep={0} onSelect={onChat} />
        <div>
          <h1 className="text-xl font-bold">{t("ui3g7.chatEndpointSetup.chooseHow")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("ui3g7.chatEndpointSetup.whatConnection", { provider: providerNames[provider] })}
          </p>
        </div>
        <div className="grid gap-3">
          <button
            type="button"
            className="flex items-center gap-4 rounded-xl border border-border p-4 text-left hover:bg-accent/40"
            onClick={onChat}
          >
            <AgentAvatar size={48} />
            <span>
              <span className="block text-sm font-semibold">
                {t("ui3g7.chatEndpointSetup.chatWithAgent")}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {t("ui3g7.chatEndpointSetup.peopleCan", { provider: providerNames[provider] })}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="flex items-center gap-4 rounded-xl border border-border p-4 text-left hover:bg-accent/40"
            onClick={onTools}
          >
            <span className="flex size-12 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
              <Hammer className="size-8" />
            </span>
            <span>
              <span className="block text-sm font-semibold">
                {t("ui3g7.chatEndpointSetup.useAsTool")}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {t("ui3g7.chatEndpointSetup.letAgents", { provider: providerNames[provider] })}
              </span>
            </span>
          </button>
        </div>
      </div>
  );
}

export function ChatEndpointSetup() {
  const [params] = useSearchParams();
  if (params.get("provider") === "github") return <GitHubChatSetup />;
  return params.get("provider") === "agentmail" ? <EmailEndpointSetup /> : <ChatSdkEndpointSetup />;
}

function ChatSdkEndpointSetup() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const provider = isProvider(params.get("provider"))
    ? (params.get("provider") as ChatProvider)
    : null;
  const toolHref = params.get("toolHref") || "/apps";
  const preselectedAgent = params.get("agentId") ?? "";
  const resumeEndpointId = params.get("resume") ?? "";
  const reconnectRequested = params.get("reconnect") === "1";
  const [purpose, setPurpose] = useState<"choice" | "chat">(
    params.get("purpose") === "chat" ? "chat" : "choice",
  );
  const [agentId, setAgentId] = useState(preselectedAgent);
  const [slackCredentialsReady, setSlackCredentialsReady] = useState(params.get("stage") === "credentials");
  const [viewedStep, setViewedStep] = useState<number | null>(null);
  const [slackIdentityReady, setSlackIdentityReady] = useState(false);
  const [automaticBusy, setAutomaticBusy] = useState(false);
  const [managedAutoStart, setManagedAutoStart] = useState(Boolean(resumeEndpointId));
  const [slackDraft, setSlackDraft] = useState<{ agentId: string; app: SlackAppConfiguration } | null>(null);
  const [endpoint, setEndpoint] = useState<ChatEndpoint | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [generatedWebhookSecret, setGeneratedWebhookSecret] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("ui3g7.chatEndpointSetup.connectors"), href: "/apps" },
      { label: t("ui3g7.chatEndpointSetup.connectChat") },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const agentsQuery = useQuery({
    queryKey: ["chat-endpoint-setup-agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const resumeQuery = useQuery({
    queryKey: ["chat-endpoint-setup-resume", resumeEndpointId],
    queryFn: () => chatEndpointsApi.get(resumeEndpointId),
    enabled: Boolean(resumeEndpointId),
    refetchInterval: query => ["creating", "install", "credentials_saved"].includes(query.state.data?.setup?.slackRegistration?.status ?? "") ? 1_500 : false,
  });
  useEffect(() => {
    if (!resumeQuery.data) return;
    setEndpoint(current => {
      if (isProvisionedSlackSetup(current?.setup?.slackSetupMethod) && !current?.providerAccountId && resumeQuery.data.providerAccountId) setViewedStep(null);
      return resumeQuery.data;
    });
    setAgentId(resumeQuery.data.assignedAgentId);
    setPurpose("chat");
  }, [resumeQuery.data]);
  const githubVerificationQuery = useQuery({
    queryKey: ["chat-endpoint-github-webhook-verification", endpoint?.id],
    queryFn: () => chatEndpointsApi.get(endpoint!.id),
    enabled: Boolean(
      provider === "github" &&
      endpoint?.id &&
      endpoint.setup?.step === "provider_setup" &&
      endpoint.setup?.webhookSecretConfigured &&
      !endpoint.setup.webhookVerifiedAt,
    ),
    refetchInterval: 1_500,
  });
  useEffect(() => {
    if (
      !githubVerificationQuery.data ||
      provider !== "github" ||
      !endpoint ||
      endpoint.id !== githubVerificationQuery.data.id ||
      endpoint.setup?.step !== "provider_setup" ||
      !endpoint.setup?.webhookSecretConfigured ||
      endpoint.setup.webhookVerifiedAt
    )
      return;
    setEndpoint(githubVerificationQuery.data);
  }, [endpoint, githubVerificationQuery.data, provider]);
  const experimentalSettingsQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
    enabled: endpoint?.setup?.step === "test",
  });
  const activeAgents = useMemo(
    () =>
      (agentsQuery.data ?? []).filter((agent) =>
        isAgentStatusInvokable(agent.status),
      ),
    [agentsQuery.data],
  );
  const selectedAgent = agentsQuery.data?.find(agent => agent.id === agentId);
  const slackDetails = slackDraft?.agentId === agentId ? slackDraft.app
    : endpoint?.setup?.slackApp ?? defaultSlackAppConfiguration(selectedAgent?.name ?? endpoint?.assignedAgentName ?? "");
  const slackDetailsValidation = slackAppConfigurationSchema.safeParse(slackDetails);
  const slackDetailsEditable = !automaticBusy && (!endpoint || endpoint.status === "draft" && !endpoint.botExternalId
    && (!endpoint.setup?.slackRegistration || endpoint.setup.slackRegistration.status === "failed"));
  const syncEndpointSnapshot = (
    next: ChatEndpoint,
    onlyIfStillVisible = false,
  ) => {
    if (next.setup?.slackSetupMethod === "managed" && endpoint && endpoint.setup?.slackSetupMethod !== "managed") setManagedAutoStart(true);
    if (isProvisionedSlackSetup(next.setup?.slackSetupMethod) && next.setup?.slackRegistration?.status === "configured"
      && endpoint?.setup?.slackRegistration?.status !== "configured") setViewedStep(null);
    setEndpoint((visible) =>
      onlyIfStillVisible && visible?.id !== next.id ? visible : next,
    );
    queryClient.setQueryData(["chat-endpoint-setup-resume", next.id], next);
    queryClient.setQueryData(queryKeys.chatEndpoints.detail(next.id), next);
    if (next.provider === "github") {
      queryClient.setQueryData(
        ["chat-endpoint-github-webhook-verification", next.id],
        next,
      );
    }
  };
  const slackChoices = useQuery({
    queryKey: ["slack-setup-options", selectedCompanyId],
    queryFn: () => chatEndpointsApi.slackSetupOptions(selectedCompanyId!),
    enabled: provider === "slack" && Boolean(selectedCompanyId),
    retry: false,
  });
  const createEndpoint = useMutation({
    mutationFn: ({ ownApp = false }: { ownApp?: boolean; exit?: boolean }) => {
      if (provider === "slack" && !slackChoices.data) throw new Error(t("ui3g7.chatEndpointSetup.slackLoading"));
      return chatEndpointsApi.create(selectedCompanyId!, {
        provider: provider!,
        assignedAgentId: agentId,
        ...(provider === "slack" ? { slackSetupMethod: ownApp ? "automatic" : slackChoices.data!.defaultMethod, slackApp: slackDetailsValidation.success ? slackDetailsValidation.data : slackDetails } : {}),
      });
    },
    onSuccess: (next, { exit }) => {
      setManagedAutoStart(!exit);
      setViewedStep(exit ? 0 : null);
      syncEndpointSnapshot(next);
      if (next.provider === "imessage-photon" || next.provider === "slack" || next.provider === "speko") {
        const resumed = new URLSearchParams(params);
        resumed.set("resume", next.id);
        setParams(resumed, { replace: true });
      }
      if (exit) navigate("/apps");
    },
    onError: (error) =>
      pushToast({
        title: t("ui3g7.chatEndpointSetup.startSetupError"),
        body: error instanceof Error ? error.message : t("ui3g7.chatEndpointSetup.tryAgain"),
        tone: "error",
      }),
  });
  const saveSlackDetails = useMutation({
    scope: { id: `slack-app-details:${endpoint?.id}` },
    mutationFn: (details: SlackAppConfiguration) => chatEndpointsApi.update(endpoint!.id, { slackApp: details }),
    onSuccess: next => syncEndpointSnapshot(next),
  });
  const persistSlackDetails = async () => {
    if (endpoint && slackDetailsEditable && slackDetailsValidation.success
      && JSON.stringify(slackDetailsValidation.data) !== JSON.stringify(endpoint.setup?.slackApp))
      await saveSlackDetails.mutateAsync(slackDetailsValidation.data);
  };
  const continueFromAgent = async (exit: boolean) => {
    if (exit && provider !== "slack") { navigate("/apps"); return; }
    if (!endpoint) {
      if (!agentId) { if (exit) navigate("/apps"); return; }
      createEndpoint.mutate({ exit });
      return;
    }
    try { if (provider === "slack") await persistSlackDetails(); }
    catch { return; }
    if (exit) navigate("/apps"); else { setManagedAutoStart(true); setViewedStep(null); }
  };
  const useOwnSlackApp = useMutation({
    mutationFn: async () => {
      if (!endpoint) return createEndpoint.mutateAsync({ ownApp: true });
      await persistSlackDetails();
      return chatEndpointsApi.update(endpoint.id, { slackSetupMethod: "automatic" });
    },
    onSuccess: next => { setManagedAutoStart(false); syncEndpointSnapshot(next); setViewedStep(1); },
    onError: () => pushToast({ title: t("ui3g7.chatEndpointSetup.switchSlackError"), body: t("ui3g7.chatEndpointSetup.tryAgain"), tone: "error" }),
  });
  const setupAction = useMutation({
    mutationFn: async ({
      action,
      values,
    }: {
      action: ChatEndpointSetupAction;
      values?: Record<string, string>;
    }) => {
      const endpointId = endpoint!.id;
      try {
        return await chatEndpointsApi.setup(endpointId, provider === "imessage-photon" ? {
      action,
      ...(values?.projectSecret ? { credentials: { projectSecret: values.projectSecret } } : {}),
      ...(values?.projectId && values.allocation === "shared" ? { photon: { allocation: "shared" as const, projectId: values.projectId } } : values?.projectId && values?.lineId ? { photon: { allocation: "dedicated" as const, projectId: values.projectId, lineId: values.lineId } } : {}),
        } : { action, credentials: values });
      } catch (error) {
        // Another open tab may have completed verification, or the successful
        // response may have been lost. Read the canonical state before retrying.
        if (action === "verify") {
          const current = await chatEndpointsApi.get(endpointId).catch(() => null);
          if (current?.setup?.step === "test" || current?.setup?.step === "complete") return current;
        }
        throw error;
      }
    },
    onMutate: () => setSetupError(null),
    onSuccess: (next) => {
      setSetupError(null);
      setViewedStep(null);
      syncEndpointSnapshot(next);
      setCredentials({});
      if (next.setup?.step !== "test" && next.setup?.step !== "complete") setSlackIdentityReady(false);
    },
    onError: (error, variables) =>
      setSetupError(sanitizedSetupErrorMessage(error, variables.values)),
  });
  const generateSetupSecret = useMutation({
    mutationFn: () => chatEndpointsApi.generateSetupSecret(endpoint!.id),
    onMutate: async () => {
      const endpointId = endpoint!.id;
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: ["chat-endpoint-github-webhook-verification", endpointId],
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: ["chat-endpoint-setup-resume", endpointId],
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: queryKeys.chatEndpoints.detail(endpointId),
          exact: true,
        }),
      ]);
      return { endpointId };
    },
    onSuccess: async ({ webhookSecret }, _variables, context) => {
      const endpointId = context.endpointId;
      const markRotated = (current: ChatEndpoint) => ({
        ...current,
        setup: {
          ...current.setup,
          step: "provider_setup" as const,
          webhookSecretConfigured: true,
          webhookVerifiedAt: null,
        },
      });

      queryClient.removeQueries({
        queryKey: ["chat-endpoint-github-webhook-verification", endpointId],
        exact: true,
      });
      setGeneratedWebhookSecret(webhookSecret);
      setEndpoint((current) =>
        current && current.id === endpointId ? markRotated(current) : current,
      );
      queryClient.setQueryData<ChatEndpoint>(
        ["chat-endpoint-setup-resume", endpointId],
        (current) => (current ? markRotated(current) : current),
      );
      queryClient.setQueryData<ChatEndpoint>(
        queryKeys.chatEndpoints.detail(endpointId),
        (current) => (current ? markRotated(current) : current),
      );

      try {
        const current = await chatEndpointsApi.get(endpointId);
        syncEndpointSnapshot(current, true);
      } catch {
        // Keep the one-time secret copyable. Verification polling will retry the
        // canonical endpoint read without restoring a pre-rotation snapshot.
      }
    },
    onError: (error) =>
      pushToast({
        title: t("ui3g7.chatEndpointSetup.generateSecretError"),
        body: error instanceof Error ? error.message : t("ui3g7.chatEndpointSetup.tryAgain"),
        tone: "error",
      }),
  });
  const testConnection = useMutation({
    mutationFn: () => provider === "slack" ? chatEndpointsApi.finishSlackSetup(endpoint!.id) : chatEndpointsApi.test(endpoint!.id),
    onSuccess: (next) => {
      syncEndpointSnapshot(next);
      if (next.status === "active") navigate(`/apps/chat/${next.id}/settings`);
    },
    onError: (error) =>
      pushToast({
        title: provider === "slack" ? t("ui3g7.chatEndpointSetup.finishSetupError") : t("ui3g7.chatEndpointSetup.testNotComplete"),
        body:
          error instanceof Error
            ? error.message
            : provider === "slack" ? t("ui3g7.chatEndpointSetup.retryFinish") : t("ui3g7.chatEndpointSetup.sendProviderMessage"),
        tone: "error",
      }),
  });

  const repairing = isChatEndpointRepairing(
    endpoint,
    resumeEndpointId,
    reconnectRequested,
  );
  const isSlack = provider === "slack";
  const slackNavigation = slackSetupState({ endpoint, repairing, credentialsReady: slackCredentialsReady, identityReady: slackIdentityReady, defaultMethod: slackChoices.data?.defaultMethod });
  const automaticSlack = isSlack && slackNavigation.provisioned;
  const automaticSlackComplete = automaticSlack && slackNavigation.complete;
  const tryStep = isSlack ? slackNavigation.finalStage : 2;
  const availableStep = isSlack ? slackNavigation.availableStage : !endpoint ? 0
    : !repairing && (endpoint.setup?.step === "test" || endpoint.setup?.step === "complete") ? tryStep : 1;
  const step = Math.min(viewedStep ?? availableStep, availableStep);
  const agentStepBusy = automaticBusy || createEndpoint.isPending || saveSlackDetails.isPending || useOwnSlackApp.isPending;
  const slackVerificationQuery = useQuery({
    queryKey: ["chat-endpoint-slack-webhook-verification", endpoint?.id],
    queryFn: () => chatEndpointsApi.get(endpoint!.id),
    enabled: Boolean(isSlack && step === 3 && endpoint?.setup?.step === "provider_setup" &&
      !endpoint.setup.webhookVerifiedAt && !setupAction.isPending),
    refetchInterval: 1_500,
  });
  useEffect(() => {
    const next = slackVerificationQuery.data;
    if (!next || !endpoint || next.id !== endpoint.id || setupAction.isPending ||
      endpoint.setup?.step !== "provider_setup" || endpoint.setup.webhookVerifiedAt ||
      !next.setup?.webhookVerifiedAt) return;
    setEndpoint(next);
  }, [slackVerificationQuery.data, endpoint, setupAction.isPending]);
  const autoVerificationAttempt = useRef<string | null>(null);
  useEffect(() => {
    if (!isSlack || step !== 3 || endpoint?.setup?.step !== "provider_setup" ||
      !endpoint.setup.webhookVerifiedAt || setupAction.isPending) return;
    const attempt = `${endpoint.id}:${endpoint.setup.webhookVerifiedAt}`;
    if (autoVerificationAttempt.current === attempt) return;
    autoVerificationAttempt.current = attempt;
    setupAction.mutate({ action: "verify" });
  }, [isSlack, step, endpoint, setupAction]);

  if (!provider)
    return (
      <p className="text-sm text-destructive">
        {t("ui3g7.chatEndpointSetup.unsupported")}
      </p>
    );
  if (!selectedCompanyId)
    return (
      <p className="text-sm text-muted-foreground">
        {t("ui3g7.chatEndpointSetup.selectOrg")}
      </p>
    );

  if (purpose === "choice" && provider !== "speko") {
    return <ChatConnectionPurpose provider={provider} slackLabels={slackNavigation.labels} onChat={() => setPurpose("chat")} onTools={() => navigate(toolHref)} />;
  }

  return (
    <div className={automaticSlackComplete && step === tryStep ? "mx-auto w-full max-w-2xl space-y-6" : "max-w-2xl space-y-6"}>
      <ChatSetupNavigation
        labels={isSlack ? slackNavigation.labels : undefined}
        step={isSlack ? slackNavigation.toVisible(step) : step}
        availableStep={isSlack ? slackNavigation.toVisible(availableStep) : availableStep}
        disabled={agentStepBusy || setupAction.isPending || generateSetupSecret.isPending || testConnection.isPending}
        onSelect={value => setViewedStep(isSlack ? slackNavigation.toStage(value) : value)}
      />
      <div className="min-w-0 space-y-6">
        {step === 0 ? (
          <>
            <div>
              <h1 className="text-xl font-bold">
                {t("ui3g7.chatEndpointSetup.whichAgent")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("ui3g7.chatEndpointSetup.agentPermanent")}
              </p>
            </div>
            {endpoint ? (
              <Input aria-label={t("ui3g7.chatEndpointSetup.assignedAgent")} value={endpoint.assignedAgentName ?? selectedAgent?.name ?? agentId} readOnly />
            ) : <AgentSelect
              agents={activeAgents}
              value={agentId}
              onChange={setAgentId}
              placeholder={t("ui3g7.chatEndpointSetup.chooseActiveAgent")}
              emptyMessage={t("ui3g7.chatEndpointSetup.noActiveAgents")}
            />}
            {isSlack && (selectedAgent || endpoint) && <SlackSetupAdvanced>
              <SlackAppDetails value={slackDetails} readOnly={!slackDetailsEditable || agentStepBusy}
                onChange={app => setSlackDraft({ agentId, app })}
                onBlur={() => void persistSlackDetails().catch(() => {})} />
              {saveSlackDetails.isError && <p role="alert" className="text-sm text-destructive">{t("ui3g7.chatEndpointSetup.saveSlackError")}</p>}
              {slackChoices.data?.defaultMethod === "managed" && (!endpoint || endpoint.setup?.slackSetupMethod === "managed") && !endpoint?.setup?.slackRegistration && <Button
                variant="link" className="h-auto p-0 text-muted-foreground"
                disabled={agentStepBusy || !slackDetailsValidation.success}
                onClick={() => useOwnSlackApp.mutate()}
              >{t("ui3g7.chatEndpointSetup.useOwnApp")}</Button>}
            </SlackSetupAdvanced>}
            {isSlack && !endpoint && !slackChoices.data && (slackChoices.isError
              ? <div role="alert" className="text-sm text-destructive">{t("ui3g7.chatEndpointSetup.loadSlackError")} <Button variant="link" disabled={slackChoices.isFetching} onClick={() => void slackChoices.refetch()}>{t("ui3g7.chatEndpointSetup.retry")}</Button></div>
              : <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("ui3g7.chatEndpointSetup.loadingSlack")}</p>)}
            {provider === "github" && <GitHubAgentTrustWarning agent={selectedAgent} />}
            <SetupWizardFooter disabled={agentStepBusy || isSlack && !endpoint && Boolean(agentId) && !slackChoices.data} onSaveExit={() => void continueFromAgent(true)}>
              <Button
                disabled={!agentId || agentStepBusy || isSlack && (!slackDetailsValidation.success || !endpoint && !slackChoices.data)}
                onClick={() => void continueFromAgent(false)}
              >
                {createEndpoint.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t("ui3g7.chatEndpointSetup.continue")}
              </Button>
            </SetupWizardFooter>
          </>
        ) : null}
        {endpoint && !(automaticSlackComplete && step === tryStep) && (
          <div hidden={step !== 1 && !(isSlack && (step === 2 || step === 3))} className="space-y-6">
            {setupError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <p className="font-medium">{t("ui3g7.chatEndpointSetup.connectionFailed")}</p>
                <p className="mt-1">{setupError}</p>
              </div>
            ) : null}
            <ProviderConnectStep
              key={`${provider}:${endpoint.id}`}
              provider={provider}
              managedAutoStart={managedAutoStart && step !== 0}
              slackStage={step === 1 ? "app" : step === 3 ? "finish" : "credentials"}
              onSlackCredentialsContinue={() => setViewedStep(3)}
              onSlackVerificationContinue={() => setViewedStep(4)}
              slackVerificationError={slackVerificationQuery.isError}
              onSlackAppCreated={() => {
                setSlackCredentialsReady(true);
                setViewedStep(2);
                const resumed = new URLSearchParams(params);
                resumed.set("resume", endpoint.id);
                resumed.set("stage", "credentials");
                setParams(resumed, { replace: true });
              }}
              agentName={selectedAgent?.name ?? endpoint.assignedAgentName}
              endpoint={endpoint}
              onEndpointSaved={syncEndpointSnapshot}
              credentials={credentials}
              setCredentials={setCredentials}
              repairing={repairing}
              pending={setupAction.isPending}
              onAutomaticBusy={setAutomaticBusy}
              generatedWebhookSecret={generatedWebhookSecret}
              generatingSetupSecret={generateSetupSecret.isPending}
              onGenerateSetupSecret={() => generateSetupSecret.mutate()}
              onAction={(action, values) =>
                setupAction.mutate({ action, values })
              }
            />
          </div>
        )}
        {endpoint && isSlack && !automaticSlack && step === 4 && (
          <SlackIdentityStep
            endpointId={endpoint.id}
            command={endpoint.setup?.slackApp?.command ?? endpoint.setup?.command ?? "/paperclip"}
            testStartedAt={endpoint.setup?.testStartedAt}
            onSaveExit={() => navigate("/apps")}
            onConnected={() => {
              setSlackIdentityReady(true);
              setViewedStep(5);
            }}
          />
        )}
        {endpoint && step === tryStep && provider === "speko" && (
          <div className="space-y-5">
            <h1 className="text-xl font-bold">{t("ui3g7.chatEndpointSetup.speko")}</h1>
            <p className="text-sm text-muted-foreground">{t("ui3g7.chatEndpointSetup.spekoHelp")}</p>
            <NativeVoiceConversation companyId={endpoint.companyId} endpointId={endpoint.id} agentName={selectedAgent?.name ?? endpoint.assignedAgentName} />
            <SetupWizardFooter onSaveExit={() => navigate("/apps")}><Button disabled={testConnection.isPending} onClick={() => testConnection.mutate()}>{t("ui3g7.chatEndpointSetup.verifyTest")}</Button></SetupWizardFooter>
          </div>
        )}
        {endpoint && step === tryStep && provider !== "speko" && (!automaticSlack || automaticSlackComplete) && (
          automaticSlack ? <div className="flex flex-col items-center gap-6 py-8 text-center">
            <AgentCharacter
              agent={selectedAgent ?? { id: endpoint.assignedAgentId, name: endpoint.assignedAgentName }}
              size={256} state="success" trackingScope="page"
              label={t("ui3g7.chatEndpointSetup.avatarLabel", { name: selectedAgent?.name ?? endpoint.assignedAgentName })}
            />
            <div className="flex flex-col items-center gap-3">
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <CheckCircle2 aria-hidden="true" className="size-6 text-(--status-task-done)" />
                {t("ui3g7.chatEndpointSetup.success")}
              </h1>
              <p className="flex flex-wrap items-center justify-center gap-2 text-base text-muted-foreground">
                <span>{t("ui3g7.chatEndpointSetup.canTalk", { name: selectedAgent?.name ?? endpoint.assignedAgentName })}</span>
                <img src="/brands/apps/slack.svg" alt="" aria-hidden="true" className="size-6" />
              </p>
            </div>
            <Button disabled={testConnection.isPending} onClick={() => testConnection.mutate()}>
              {testConnection.isPending && <Loader2 className="size-4 animate-spin" />}{t("ui3g7.chatEndpointSetup.done")}
            </Button>
          </div> : <TryStep
            endpointId={endpoint.id}
            provider={provider}
            agentName={selectedAgent?.name ?? endpoint.assignedAgentName}
            botLabel={endpoint.botLabel}
            botUsername={endpoint.botUsername}
            slackAccount={endpoint.setup?.slackAccount}
            photonAllocation={endpoint.photonAllocation}
            providerUrl={endpoint.setup?.slackAccount?.dmChannelId && endpoint.providerAccountId ? `https://app.slack.com/client/${encodeURIComponent(endpoint.providerAccountId)}/${encodeURIComponent(endpoint.setup.slackAccount.dmChannelId)}` : endpoint.setup?.providerUrl}
            guestIsolationState={
              experimentalSettingsQuery.isPending
                ? "loading"
                : experimentalSettingsQuery.isError
                  ? "unknown"
                  : experimentalSettingsQuery.data?.enableIsolatedWorkspaces ===
                      true
                    ? "enabled"
                    : "disabled"
            }
            pending={testConnection.isPending}
            onOpenAccess={() => navigate(`/apps/chat/${endpoint.id}/access`)}
            onTest={() => testConnection.mutate()}
            onSaveExit={() => navigate("/apps")}
          />
        )}
        {step !== 0 && !isSlack && provider !== "speko" && <div className="flex justify-start">
          <Button className="text-muted-foreground" variant="ghost" onClick={() => navigate("/apps")}>
            {t("ui3g7.chatEndpointSetup.saveExit")}
          </Button>
        </div>}
      </div>
    </div>
  );
}

function ProviderConnectStep({
  provider,
  slackStage,
  onSlackCredentialsContinue,
  onSlackVerificationContinue,
  slackVerificationError,
  onSlackAppCreated,
  agentName,
  endpoint,
  credentials,
  setCredentials,
  repairing,
  pending,
  onAutomaticBusy,
  managedAutoStart = false,
  onEndpointSaved,
  generatedWebhookSecret,
  generatingSetupSecret,
  onGenerateSetupSecret,
  onAction,
}: {
  provider: ChatProvider;
  slackStage: "app" | "credentials" | "finish";
  onSlackCredentialsContinue: () => void;
  onSlackVerificationContinue: () => void;
  slackVerificationError: boolean;
  onSlackAppCreated: () => void;
  agentName: string;
  endpoint: ChatEndpoint;
  credentials: Record<string, string>;
  setCredentials: Dispatch<SetStateAction<Record<string, string>>>;
  repairing: boolean;
  pending: boolean;
  managedAutoStart?: boolean;
  onAutomaticBusy: (busy: boolean) => void;
  onEndpointSaved: (endpoint: ChatEndpoint) => void;
  generatedWebhookSecret: string;
  generatingSetupSecret: boolean;
  onGenerateSetupSecret: () => void;
  onAction: (
    action: ChatEndpointSetupAction,
    values?: Record<string, string>,
  ) => void;
}) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const slackBotToken = (credentials.botToken ?? "").trim();
  const slackBotTokenInvalid = provider === "slack" && slackBotToken.length > 0 &&
    !slackBotToken.startsWith("xoxb-");
  const slackSigningSecretHasTokenPrefix = provider === "slack" &&
    /^x[a-z0-9]*-/i.test((credentials.signingSecret ?? "").trim());
  const slackCredentialsSaved = provider === "slack" && Boolean(endpoint.providerAccountId);
  const continueWithSavedSlackCredentials = slackCredentialsSaved && !repairing &&
    !slackBotToken && !credentials.signingSecret?.trim();
  const reportCopyFailure = () =>
    pushToast({
      title: t("ui3g7.chatEndpointSetup.copyError"),
      body: t("ui3g7.chatEndpointSetup.copyManual"),
      tone: "error",
    });
  const field = (key: string, label: string, type = "password") => (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Input
        type={type}
        value={credentials[key] ?? ""}
        onChange={(event) =>
          setCredentials({ ...credentials, [key]: event.target.value })
        }
      />
    </label>
  );
  const openProviderSetup = (fallback: string) =>
    window.open(
      endpoint.setup?.authorizationUrl ??
        endpoint.setup?.providerUrl ??
        fallback,
      "_blank",
      "noopener,noreferrer",
    );
  const endpointValue = (label: string, value: string | null | undefined) => (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="rounded-lg border border-border bg-muted p-3 font-mono text-xs break-all">
        {value ??
          t("ui3g7.chatEndpointSetup.endpointUnavailable")}
      </div>
    </div>
  );
  const [manifestCopied, setManifestCopied] = useState(false);
  // A hook rather than a sticky boolean: this step stays mounted when the
  // secret is regenerated, so a latched "copied" would keep vouching for a
  // value the reader never copied. The status resets itself, and a refused
  // clipboard reads as a failure instead of a success.
  const webhookSecretCopy = useCopyAction();
  const [openingSlackApp, setOpeningSlackApp] = useState(false);
  const slackAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setOpeningSlackApp(false);
    return () => {
      if (slackAdvanceTimer.current !== null) {
        clearTimeout(slackAdvanceTimer.current);
        slackAdvanceTimer.current = null;
      }
    };
  }, [slackStage]);
  const [privateKeyVisible, setPrivateKeyVisible] = useState(false);
  const [privateKeyFileError, setPrivateKeyFileError] = useState<string | null>(
    null,
  );
  const [privateKeyFileLoaded, setPrivateKeyFileLoaded] = useState(false);
  const [privateKeyFileLoading, setPrivateKeyFileLoading] = useState(false);
  const privateKeyFileInputRef = useRef<HTMLInputElement>(null);
  const privateKeyReadGuard = useRef(createGitHubPrivateKeyReadGuard()).current;
  useEffect(
    () => () => {
      privateKeyReadGuard.invalidate();
    },
    [privateKeyReadGuard],
  );
  const loadPrivateKeyFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const readRevision = privateKeyReadGuard.start();
    setPrivateKeyFileError(null);
    setPrivateKeyFileLoaded(false);
    setPrivateKeyFileLoading(true);
    try {
      const privateKey = await readGitHubPrivateKeyFile(file);
      if (!privateKeyReadGuard.isCurrent(readRevision)) return;
      setCredentials((current) => ({ ...current, privateKey }));
      setPrivateKeyVisible(false);
      setPrivateKeyFileLoaded(true);
    } catch (error) {
      if (!privateKeyReadGuard.isCurrent(readRevision)) return;
      setPrivateKeyFileError(
        error instanceof Error
          ? error.message
          : t("ui3g7.chatEndpointSetup.pemError"),
      );
    } finally {
      if (privateKeyReadGuard.isCurrent(readRevision)) {
        setPrivateKeyFileLoading(false);
      }
    }
  };
  const replacePrivateKey = (privateKey: string) => {
    privateKeyReadGuard.invalidate();
    setPrivateKeyFileError(null);
    setPrivateKeyFileLoaded(false);
    setPrivateKeyFileLoading(false);
    setCredentials((current) => ({ ...current, privateKey }));
  };
  const slackApp = endpoint.setup?.slackApp ?? {
    ...defaultSlackAppConfiguration(agentName),
    ...(endpoint.setup?.command ? { command: endpoint.setup.command } : {}),
  };
  const automaticSlack = isProvisionedSlackSetup(endpoint.setup?.slackSetupMethod);
  const slackValidation = slackAppConfigurationSchema.safeParse(slackApp);
  const saveSlackAndExit = () => navigate("/apps");
  const slackAppName = slackApp.appName.trim();
  const slackBotName = slackApp.botName.trim();
  const slackCommand = slackApp.command.trim();
  const slackWebhookUrl =
    endpoint.setup?.webhookUrl ?? "<paperclip-webhook-url>";
  const slackManifest = JSON.stringify(buildSlackAppManifest({
    app: { appName: slackAppName, botName: slackBotName, command: slackCommand }, agentName,
    webhookUrl: slackWebhookUrl,
    ...(automaticSlack && endpoint.setup?.slackOAuthCallbackUri ? { redirectUri: endpoint.setup.slackOAuthCallbackUri } : {}),
  }), null, 2);
  const slackCreateUrl = `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(slackManifest)}`;
  useEffect(() => setManifestCopied(false), [slackManifest]);
  const teamsClientId =
    credentials.clientId?.trim() || "<application-client-id>";
  const teamsManifestSettings = JSON.stringify(
    {
      bots: [
        {
          botId: teamsClientId,
          scopes: ["personal", "team", "groupChat"],
          supportsFiles: true,
          isNotificationOnly: false,
          commandLists: [
            {
              scopes: ["personal", "groupChat"],
              commands: [
                {
                  title: "/status",
                  description: "Show the active Paperclip task status",
                },
                {
                  title: "/new",
                  description: "Start a new Paperclip task in this chat",
                },
                {
                  title: "/close",
                  description: "Close the active chat conversation",
                },
              ],
            },
          ],
        },
      ],
      webApplicationInfo: {
        id: teamsClientId,
        resource: "https://paperclip.ing",
      },
      authorization: {
        permissions: {
          resourceSpecific: [
            { name: "ChannelMessage.Read.Group", type: "Application" },
            { name: "ChatMessage.Read.Chat", type: "Application" },
          ],
        },
      },
    },
    null,
    2,
  );
  if (provider === "speko") return <SpekoProviderSetup onSaveExit={() => navigate("/apps")} agentName={agentName} credentials={credentials} onChange={setCredentials} onConnect={(values) => onAction(repairing ? "reconnect" : "configure", values)} callbackUrl={endpoint.setup?.webhookUrl} pending={pending} repairing={repairing} signingSecretConfigured={endpoint.setup?.webhookSecretConfigured} />;
  if (provider === "imessage-photon") return <PhotonConnectStep endpoint={endpoint} agentName={agentName} repairing={repairing} pending={pending} onAction={onAction} />;
  if (provider === "discord") {
    const applicationId = credentials.applicationId?.trim() ?? "";
    const guildId = credentials.guildId?.trim() ?? "";
    const installUrl = applicationId
      ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(applicationId)}&permissions=309237763136&scope=bot${guildId ? `&guild_id=${encodeURIComponent(guildId)}&disable_guild_select=true` : ""}`
      : null;
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{t("ui3g7.chatEndpointSetup.connectDiscord", { agent: agentName })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairing
              ? t("ui3g7.chatEndpointSetup.discordRepair")
              : t("ui3g7.chatEndpointSetup.discordCreate")}
          </p>
        </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            {t("ui3g7.chatEndpointSetup.discordStep1")}
          </li>
          <li>
            {t("ui3g7.chatEndpointSetup.discordStep2")}
          </li>
          <li>
            {t("ui3g7.chatEndpointSetup.discordStep3")}
          </li>
          <li>
            {t("ui3g7.chatEndpointSetup.discordStep4")}
          </li>
        </ol>
        <Button
          variant="outline"
          onClick={() =>
            openProviderSetup("https://discord.com/developers/applications")
          }
        >
          {t("ui3g7.chatEndpointSetup.openDiscordPortal")} <ExternalLink />
        </Button>
        {field("applicationId", t("ui3g7.chatEndpointSetup.discordAppId"), "text")}
        {field("guildId", t("ui3g7.chatEndpointSetup.serverId"), "text")}
        {field("botToken", t("ui3g7.chatEndpointSetup.botToken"))}
        {installUrl && (
          <Button asChild variant="outline">
            <a href={installUrl} target="_blank" rel="noreferrer">
              {t("ui3g7.chatEndpointSetup.installBot")} <ExternalLink />
            </a>
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          {t("ui3g7.chatEndpointSetup.discordPerms")}
        </p>
        <Button
          disabled={
            (!repairing &&
              (!credentials.applicationId ||
                !credentials.guildId ||
                !credentials.botToken)) ||
            pending
          }
          onClick={() =>
            onAction(repairing ? "reconnect" : "configure", credentials)
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {repairing ? t("ui3g7.chatEndpointSetup.reconnectDiscord") : t("ui3g7.chatEndpointSetup.connectDiscordBot")}
        </Button>
      </div>
    );
  }
  if (provider === "telegram")
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{t("ui3g7.chatEndpointSetup.createTelegram", { agent: agentName })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairing
              ? t("ui3g7.chatEndpointSetup.telegramRepair")
              : t("ui3g7.chatEndpointSetup.telegramCreate")}
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            {t("ui3g7.chatEndpointSetup.telegramStep1")}<code>/newbot</code>.
          </li>
          <li>{t("ui3g7.chatEndpointSetup.telegramStep2")}</li>
          <li>
            {t("ui3g7.chatEndpointSetup.telegramStep3")}<code>bot</code>.
          </li>
        </ol>
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t("ui3g7.chatEndpointSetup.telegramPrivacy")}{" "}
          <code>/task@bot_username &lt;request&gt;</code>{t("ui3g7.chatEndpointSetup.telegramPrivacyEnd")}
        </p>
        <Button
          variant="outline"
          onClick={() => openProviderSetup("https://t.me/BotFather")}
        >
          {t("ui3g7.chatEndpointSetup.openBotFather")} <ExternalLink />
        </Button>
        {field("botToken", t("ui3g7.chatEndpointSetup.botToken"))}
        {(!endpoint.setup?.webhookUrl || automaticSlack && !endpoint.setup?.slackOAuthCallbackUri?.startsWith("https://")) && (
          <p className="text-sm text-destructive">
            {t("ui3g7.chatEndpointSetup.telegramHttps")}
          </p>
        )}
        <Button
          disabled={
            (!repairing && !credentials.botToken) ||
            !endpoint.setup?.webhookUrl ||
            pending
          }
          onClick={() =>
            onAction(repairing ? "reconnect" : "configure", credentials)
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {repairing ? t("ui3g7.chatEndpointSetup.reconnectBot") : t("ui3g7.chatEndpointSetup.connectBot")}
        </Button>
      </div>
    );
  if (provider === "microsoft-teams")
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">
            {t("ui3g7.chatEndpointSetup.connectTeams", { agent: agentName })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairing
              ? t("ui3g7.chatEndpointSetup.teamsRepair")
              : t("ui3g7.chatEndpointSetup.teamsCreate")}
          </p>
        </div>
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t("ui3g7.chatEndpointSetup.teamsRequirements")}
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            {t("ui3g7.chatEndpointSetup.teamsEntra")}
          </li>
          <li>
            {t("ui3g7.chatEndpointSetup.teamsAzure")}
          </li>
          <li>
            {t("ui3g7.chatEndpointSetup.teamsDevPortal")}
          </li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a
              href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
              target="_blank"
              rel="noreferrer"
            >
              {t("ui3g7.chatEndpointSetup.openEntra")} <ExternalLink />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href="https://portal.azure.com/#create/Microsoft.AzureBot"
              target="_blank"
              rel="noreferrer"
            >
              {t("ui3g7.chatEndpointSetup.createAzureBot")} <ExternalLink />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href="https://dev.teams.microsoft.com/apps"
              target="_blank"
              rel="noreferrer"
            >
              {t("ui3g7.chatEndpointSetup.openTeamsPortal")} <ExternalLink />
            </a>
          </Button>
        </div>
        {endpointValue(
          t("ui3g7.chatEndpointSetup.messagingEndpoint"),
          endpoint.setup?.messagingEndpoint,
        )}
        {field("clientId", t("ui3g7.chatEndpointSetup.clientId"), "text")}
        {field("tenantId", t("ui3g7.chatEndpointSetup.tenantId"), "text")}
        {field("clientSecret", t("ui3g7.chatEndpointSetup.clientSecretValue"))}
        <section className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h2 className="text-sm font-semibold">
              {t("ui3g7.chatEndpointSetup.fieldMap")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("ui3g7.chatEndpointSetup.fieldMapHelp")}
            </p>
          </div>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              <strong>Microsoft Entra admin center · App registrations</strong>{t("ui3g7.chatEndpointSetup.tmStep1a")}<strong>New registration</strong>{t("ui3g7.chatEndpointSetup.tmStep1b")}<strong>Accounts in this organizational directory only (Single tenant)</strong>{t("ui3g7.chatEndpointSetup.tmStep1c")}<strong>Register</strong>{t("ui3g7.chatEndpointSetup.tmStep1d")}<strong>Application (client) ID</strong>{t("ui3g7.chatEndpointSetup.tmStep1e")}<strong>Directory (tenant) ID</strong>{t("ui3g7.chatEndpointSetup.tmStep1f")}<strong>Certificates &amp; secrets · Client secrets</strong>{t("ui3g7.chatEndpointSetup.tmStep1g")}<strong>New client secret</strong>{t("ui3g7.chatEndpointSetup.tmStep1h")}<strong>Value</strong>{t("ui3g7.chatEndpointSetup.tmStep1i")}
            </li>
            <li>
              <strong>Azure · Create Azure Bot</strong>{t("ui3g7.chatEndpointSetup.tmStep2a")}<strong>Microsoft App ID</strong>{t("ui3g7.chatEndpointSetup.tmStep2b")}<strong>Single Tenant</strong>{t("ui3g7.chatEndpointSetup.tmStep2c")}<strong>Creation type</strong>{t("ui3g7.chatEndpointSetup.tmStep2d")}<strong>Use existing app registration</strong>{t("ui3g7.chatEndpointSetup.tmStep2e")}<strong>Settings · Configuration</strong>{t("ui3g7.chatEndpointSetup.tmStep2f")}<strong>Messaging endpoint</strong>{t("ui3g7.chatEndpointSetup.tmStep2g")}<strong>Settings · Channels</strong>{t("ui3g7.chatEndpointSetup.tmStep2h")}<strong>Microsoft Teams</strong>{t("ui3g7.chatEndpointSetup.tmStep2i")}
            </li>
            <li>
              <strong>Teams Developer Portal · Apps</strong>{t("ui3g7.chatEndpointSetup.tmStep3a")}<strong>New app</strong>{t("ui3g7.chatEndpointSetup.tmStep3b")}<strong>Configure · App features · Bot</strong>{t("ui3g7.chatEndpointSetup.tmStep3c")}<strong>Personal</strong>{t("ui3g7.chatEndpointSetup.tmStep3d")}<strong>Team</strong>{t("ui3g7.chatEndpointSetup.tmStep3e")}<strong>Group chat</strong>{t("ui3g7.chatEndpointSetup.tmStep3f")}<strong>Configure · Permissions</strong>{t("ui3g7.chatEndpointSetup.tmStep3g")}<strong>Application</strong>{t("ui3g7.chatEndpointSetup.tmStep3h")}
            </li>
            <li>
              <strong>Microsoft Teams · Apps · Manage your apps</strong>{t("ui3g7.chatEndpointSetup.tmStep4a")}<strong>Upload an app · Upload a custom app</strong>{t("ui3g7.chatEndpointSetup.tmStep4b")}
            </li>
          </ol>
        </section>
        <label className="grid gap-2 text-sm font-medium">
          {t("ui3g7.chatEndpointSetup.manifestBlock")}
          <Textarea
            className="min-h-80 font-mono text-xs"
            readOnly
            value={teamsManifestSettings}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!credentials.clientId?.trim()}
            onClick={() => {
              void copyTextToClipboard(teamsManifestSettings).then(
                () => setManifestCopied(true),
                reportCopyFailure,
              );
            }}
          >
            {manifestCopied
              ? t("ui3g7.chatEndpointSetup.manifestCopied")
              : t("ui3g7.chatEndpointSetup.copyManifest")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("ui3g7.chatEndpointSetup.teamsManifestHelp")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("ui3g7.chatEndpointSetup.teamsSsoPrefix")}<code>webApplicationInfo</code>{t("ui3g7.chatEndpointSetup.teamsSsoSuffix")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("ui3g7.chatEndpointSetup.teamsRscHelp")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("ui3g7.chatEndpointSetup.teamsFilesPrefix")}<code>supportsFiles: true</code>{t("ui3g7.chatEndpointSetup.teamsFilesSuffix")}
        </p>
        {!endpoint.setup?.messagingEndpoint && (
          <p className="text-sm text-destructive">
            {t("ui3g7.chatEndpointSetup.teamsHttps")}
          </p>
        )}
        <Button
          disabled={
            (!repairing &&
              (!credentials.clientId ||
                !credentials.tenantId ||
                !credentials.clientSecret)) ||
            !endpoint.setup?.messagingEndpoint ||
            pending
          }
          onClick={() =>
            onAction(repairing ? "reconnect" : "configure", credentials)
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {repairing
            ? t("ui3g7.chatEndpointSetup.reconnectMicrosoft")
            : t("ui3g7.chatEndpointSetup.verifyMicrosoft")}
        </Button>
      </div>
    );
  if (provider === "github")
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">
            {repairing
              ? t("ui3g7.chatEndpointSetup.reconnectGitHubApp")
              : t("ui3g7.chatEndpointSetup.createGitHubApp")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairing
              ? t("ui3g7.chatEndpointSetup.githubRepair")
              : t("ui3g7.chatEndpointSetup.githubCreate")}
          </p>
        </div>
        {!repairing && (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              {t("ui3g7.chatEndpointSetup.ghStep1")}
            </li>
            <li>
              {t("ui3g7.chatEndpointSetup.ghStep2a")}<strong>Webhooks · Active</strong>{t("ui3g7.chatEndpointSetup.ghStep2b")}<strong>Enable SSL verification</strong>{t("ui3g7.chatEndpointSetup.ghStep2c")}
            </li>
            <li>
              {t("ui3g7.chatEndpointSetup.ghStep3a")}<strong>Issues</strong>{t("ui3g7.chatEndpointSetup.ghStep3b")}<strong>Pull requests</strong>{t("ui3g7.chatEndpointSetup.ghStep3c")}<strong>Read &amp; write</strong>{t("ui3g7.chatEndpointSetup.ghStep3d")}
            </li>
            <li>
              {t("ui3g7.chatEndpointSetup.ghStep4a")}<strong>Issue comment</strong>{t("ui3g7.chatEndpointSetup.ghStep4b")}<code>issue_comment</code>{t("ui3g7.chatEndpointSetup.ghStep4c")}<strong>Pull request review comment</strong>{t("ui3g7.chatEndpointSetup.ghStep4d")}<code>pull_request_review_comment</code>{t("ui3g7.chatEndpointSetup.ghStep4e")}<code>installation</code>{t("ui3g7.chatEndpointSetup.ghStep4f")}<code>installation_repositories</code>{t("ui3g7.chatEndpointSetup.ghStep4g")}
            </li>
            <li>
              {t("ui3g7.chatEndpointSetup.ghStep5a")}<strong>Only on this account</strong>{t("ui3g7.chatEndpointSetup.ghStep5b")}
            </li>
          </ol>
        )}
        {endpointValue(
          t("ui3g7.chatEndpointSetup.homepageUrl"),
          publicOrigin(endpoint.setup?.webhookUrl),
        )}
        {endpointValue(t("ui3g7.chatEndpointSetup.webhookUrl"), endpoint.setup?.webhookUrl)}
        <Button
          variant="outline"
          onClick={() =>
            window.open(
              repairing
                ? "https://github.com/settings/apps"
                : (endpoint.setup?.authorizationUrl ??
                    "https://github.com/settings/apps/new"),
              "_blank",
              "noopener,noreferrer",
            )
          }
        >
          {repairing ? t("ui3g7.chatEndpointSetup.openAppSettings") : t("ui3g7.chatEndpointSetup.openNewApp")}{" "}
          <ExternalLink />
        </Button>
        {field("appId", t("ui3g7.chatEndpointSetup.githubAppId"), "text")}
        <div className="grid gap-2 text-sm font-medium">
          <label htmlFor="github-private-key">{t("ui3g7.chatEndpointSetup.privateKeyPem")}</label>
          <div className="relative">
            {privateKeyVisible ? (
              <Textarea
                id="github-private-key"
                className="min-h-24 pr-11 font-mono text-xs"
                value={credentials.privateKey ?? ""}
                onChange={(event) => replacePrivateKey(event.target.value)}
              />
            ) : (
              <Input
                id="github-private-key"
                type="password"
                className="pr-11 font-mono text-xs"
                value={credentials.privateKey ?? ""}
                onChange={(event) => replacePrivateKey(event.target.value)}
                onPaste={(event) => {
                  event.preventDefault();
                  replacePrivateKey(event.clipboardData.getData("text"));
                }}
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1"
              aria-label={
                privateKeyVisible ? t("ui3g7.chatEndpointSetup.hideKey") : t("ui3g7.chatEndpointSetup.showKey")
              }
              onClick={() => setPrivateKeyVisible((visible) => !visible)}
            >
              {privateKeyVisible ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          <input
            ref={privateKeyFileInputRef}
            type="file"
            accept=".pem,.key,application/x-pem-file,application/pkcs8,text/plain"
            className="hidden"
            aria-label={t("ui3g7.chatEndpointSetup.pickKeyFileLabel")}
            onChange={loadPrivateKeyFile}
          />
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => privateKeyFileInputRef.current?.click()}
            >
              {t("ui3g7.chatEndpointSetup.choosePem")}
            </Button>
          </div>
          {privateKeyFileError ? (
            <p role="alert" className="text-sm text-destructive">
              {privateKeyFileError}
            </p>
          ) : null}
          {privateKeyFileLoading ? (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >
              {t("ui3g7.chatEndpointSetup.readingKey")}
            </p>
          ) : privateKeyFileLoaded ? (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >
              {t("ui3g7.chatEndpointSetup.keyLoaded")}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-medium">{t("ui3g7.chatEndpointSetup.webhookSecret")}</p>
          {generatedWebhookSecret ? (
            <>
              <Input
                aria-label={t("ui3g7.chatEndpointSetup.generatedSecretLabel")}
                className="font-mono text-xs"
                readOnly
                value={generatedWebhookSecret}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    // Both signals, and each covers the other's blind spot.
                    // The toast is the loud one, the way this step's other two
                    // copy buttons report failure — but the provider dedupes an
                    // identical toast inside 3.5s, so a reader who clicks twice
                    // on a blocked clipboard would see nothing the second time.
                    // The inline state answers every click.
                    void webhookSecretCopy
                      .copy(generatedWebhookSecret)
                      .then((status) => {
                        if (status === "failed") reportCopyFailure();
                      });
                  }}
                >
                  {webhookSecretCopy.copied
                    ? t("ui3g7.chatEndpointSetup.secretCopied")
                    : webhookSecretCopy.failed
                      ? t("ui3g7.chatEndpointSetup.secretCopyFailed")
                      : t("ui3g7.chatEndpointSetup.copySecret")}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("ui3g7.chatEndpointSetup.copyNow")}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {endpoint.setup?.webhookSecretConfigured
                ? t("ui3g7.chatEndpointSetup.secretConfigured")
                : t("ui3g7.chatEndpointSetup.generateSecretHelp")}
            </p>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={generatingSetupSecret}
              onClick={onGenerateSetupSecret}
            >
              {generatingSetupSecret && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {endpoint.setup?.webhookSecretConfigured
                ? t("ui3g7.chatEndpointSetup.regenerateSecret")
                : t("ui3g7.chatEndpointSetup.generateSecret")}
            </Button>
          </div>
          {endpoint.setup?.webhookSecretConfigured && (
            <p className="text-sm text-muted-foreground">
              {endpoint.providerAccountId || endpoint.botExternalId
                ? t("ui3g7.chatEndpointSetup.regenerateWarn")
                : t("ui3g7.chatEndpointSetup.generateWarn")}
            </p>
          )}
          {endpoint.setup?.webhookSecretConfigured && (
            <p
              className={`text-sm ${endpoint.setup.webhookVerifiedAt ? "text-foreground" : "text-muted-foreground"}`}
            >
              {endpoint.setup.webhookVerifiedAt
                ? t("ui3g7.chatEndpointSetup.webhookVerified")
                : t("ui3g7.chatEndpointSetup.webhookWaiting")}
            </p>
          )}
        </div>
        {(!endpoint.setup?.webhookUrl || automaticSlack && !endpoint.setup?.slackOAuthCallbackUri?.startsWith("https://")) && (
          <p className="text-sm text-destructive">
            {t("ui3g7.chatEndpointSetup.githubHttps")}
          </p>
        )}
        <Button
          disabled={
            (!repairing && (!credentials.appId || !credentials.privateKey)) ||
            !endpoint.setup?.webhookSecretConfigured ||
            !endpoint.setup?.webhookVerifiedAt ||
            !endpoint.setup?.webhookUrl ||
            privateKeyFileLoading ||
            generatingSetupSecret ||
            pending
          }
          onClick={() =>
            onAction(repairing ? "reconnect" : "configure", credentials)
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {repairing ? t("ui3g7.chatEndpointSetup.reconnectVerify") : t("ui3g7.chatEndpointSetup.connectVerify")}
        </Button>
      </div>
    );
  const slackRequestUrlInstructions = <ol className="list-decimal space-y-2 pl-5 text-sm">
      <li><a className="underline underline-offset-4" href={endpoint.setup?.slackRegistration?.appId ? `https://api.slack.com/apps/${encodeURIComponent(endpoint.setup.slackRegistration.appId)}/event-subscriptions` : "https://api.slack.com/apps"} target="_blank" rel="noopener noreferrer">{t("ui3g7.chatEndpointSetup.slackOpenSettings")} <ExternalLink className="inline size-3" /></a>{t("ui3g7.chatEndpointSetup.slackAndChoose")}<strong>{slackApp.appName}</strong>.</li>
      <li>{t("ui3g7.chatEndpointSetup.slackChoose")}<strong>Event Subscriptions</strong>.</li>
      <li>{t("ui3g7.chatEndpointSetup.slackBeside")}<strong>Request URL</strong>{t("ui3g7.chatEndpointSetup.slackClick")}<strong>Retry</strong>{t("ui3g7.chatEndpointSetup.slackVerify")}</li>
    </ol>;
  if (slackStage === "finish")
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{automaticSlack ? t("ui3g7.chatEndpointSetup.sendMessageAgent") : t("ui3g7.chatEndpointSetup.verifySlack")}</h1>
          {!automaticSlack && <p className="mt-1 text-sm text-muted-foreground">{t("ui3g7.chatEndpointSetup.slackConfirm")}</p>}
        </div>
        {automaticSlack ? <Button asChild variant="outline"><a href={endpoint.setup?.slackAccount?.dmChannelId && endpoint.providerAccountId ? `https://app.slack.com/client/${encodeURIComponent(endpoint.providerAccountId)}/${encodeURIComponent(endpoint.setup.slackAccount.dmChannelId)}` : endpoint.setup?.providerUrl ?? "https://app.slack.com"} target="_blank" rel="noopener noreferrer">{t("ui3g7.chatEndpointSetup.openSlack")} <ExternalLink className="size-4" /></a></Button> : slackRequestUrlInstructions}
        {endpoint.setup?.webhookVerifiedAt ? (
          <p role="status" className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-(--status-task-done)" />
            {t("ui3g7.chatEndpointSetup.slackWorking")}{pending ? automaticSlack ? t("ui3g7.chatEndpointSetup.finishingSetup") : t("ui3g7.chatEndpointSetup.openingTest") : ""}
          </p>
        ) : slackVerificationError ? (
          <p role="alert" className="text-sm text-destructive">{t("ui3g7.chatEndpointSetup.verifyCheckError")}</p>
        ) : (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {automaticSlack ? t("ui3g7.chatEndpointSetup.waitingMessage") : t("ui3g7.chatEndpointSetup.waitingSlack")}
          </p>
        )}
        <SlackSetupAdvanced label={automaticSlack ? t("ui3g7.chatEndpointSetup.didntWork") : t("ui3g7.chatEndpointSetup.troubleshooting")}>
          {automaticSlack && slackRequestUrlInstructions}
          <p className="text-muted-foreground">{t("ui3g7.chatEndpointSetup.slackAdvancedHelp")}</p>
          {endpointValue(t("ui3g7.chatEndpointSetup.webhookUrl"), endpoint.setup?.webhookUrl)}
        </SlackSetupAdvanced>
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="text-muted-foreground" onClick={() => navigate("/apps")}>{t("ui3g7.chatEndpointSetup.saveExit")}</Button>
          {(!automaticSlack || endpoint.setup?.webhookVerifiedAt) && <Button disabled={pending || !endpoint.setup?.webhookVerifiedAt} onClick={() =>
            endpoint.setup?.step === "provider_setup" ? onAction("verify") : onSlackVerificationContinue()
          }>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("ui3g7.chatEndpointSetup.continue")}
          </Button>}
        </div>
      </div>
    );

  return (
    <div className="space-y-5">
      {(!endpoint.setup?.webhookUrl || automaticSlack && !endpoint.setup?.slackOAuthCallbackUri?.startsWith("https://")) && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{t("ui3g7.chatEndpointSetup.httpsRequired")}</p>
            <p className="text-sm">
              {t("ui3g7.chatEndpointSetup.httpsRequiredBody")}
            </p>
            <a
              href="https://docs.paperclip.ing/reference/deploy/https/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline underline-offset-4"
            >
              {t("ui3g7.chatEndpointSetup.learnHttps")}
            </a>
          </div>
        </div>
      )}
      <div>
        <h1 className="text-xl font-bold">{endpoint.setup?.slackSetupMethod === "managed" ? t("ui3g7.chatEndpointSetup.connectSlack") : slackStage === "app" ? automaticSlack ? t("ui3g7.chatEndpointSetup.accessToken") : t("ui3g7.chatEndpointSetup.createSlackApp") : automaticSlack ? t("ui3g7.chatEndpointSetup.installSlackApp") : t("ui3g7.chatEndpointSetup.addSlackCredentials")}</h1>
        {repairing && !automaticSlack && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("ui3g7.chatEndpointSetup.slackRepair")}
          </p>
        )}
      </div>
      <div hidden={slackStage !== "app" || automaticSlack} className="space-y-5">
        <div className="space-y-3 text-sm">
          <div className="flex justify-end">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="link" className="h-auto p-0 text-xs text-muted-foreground underline underline-offset-4">
                  {t("ui3g7.chatEndpointSetup.viewManifest")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t("ui3g7.chatEndpointSetup.manifestTitle")}</DialogTitle>
                  <DialogDescription>
                    {t("ui3g7.chatEndpointSetup.manifestDesc")}
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  aria-label={t("ui3g7.chatEndpointSetup.manifestTitle")}
                  className="h-80 font-mono text-xs"
                  readOnly
                  value={slackManifest}
                />
                <DialogFooter>
                  <Button
                    variant="outline"
                    disabled={!slackValidation.success}
                    onClick={() => {
                      void copyTextToClipboard(slackManifest).then(
                        () => setManifestCopied(true),
                        reportCopyFailure,
                      );
                    }}
                  >
                    {manifestCopied ? t("ui3g7.chatEndpointSetup.manifestCopiedShort") : t("ui3g7.chatEndpointSetup.copyManifestShort")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        {!automaticSlack && <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
          <Button variant="ghost" className="text-muted-foreground" onClick={() => void saveSlackAndExit()}>
            {t("ui3g7.chatEndpointSetup.saveExit")}
          </Button>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" disabled={openingSlackApp || !endpoint.setup?.webhookUrl || !slackValidation.success} onClick={onSlackAppCreated}>
              {t("ui3g7.chatEndpointSetup.alreadyCreated")}
            </Button>
            {!repairing && (
              <Button
                disabled={openingSlackApp || !endpoint.setup?.webhookUrl || !slackValidation.success}
                onClick={() => {
                  window.open(slackCreateUrl, "_blank", "noopener,noreferrer");
                  setOpeningSlackApp(true);
                  // Let Slack open before changing the step behind its new tab.
                  slackAdvanceTimer.current = setTimeout(() => {
                    slackAdvanceTimer.current = null;
                    setOpeningSlackApp(false);
                    onSlackAppCreated();
                  }, 1000);
                }}
              >
                {t("ui3g7.chatEndpointSetup.createSlackAppBtn")} <ExternalLink />
              </Button>
            )}
          </div>
        </div>}
      </div>
      {automaticSlack && <SlackSetup
        key={endpoint.id}
        autoStart={managedAutoStart}
        reconnect={repairing}
        endpoint={endpoint} stage={slackStage} disabled={!endpoint.setup?.webhookUrl || !endpoint.setup?.slackOAuthCallbackUri?.startsWith("https://") || !slackValidation.success}
        saveDetails={async () => {}}
        onBusy={onAutomaticBusy} onSaved={onEndpointSaved} onContinue={onSlackAppCreated}
        onManual={async existing => {
          onEndpointSaved(await chatEndpointsApi.update(endpoint.id, { slackSetupMethod: existing ? "existing" : "manual" }));
          if (existing) onSlackAppCreated();
        }}
        onSaveExit={() => void saveSlackAndExit()}
      />}
      {!automaticSlack && <div hidden={slackStage !== "credentials"} className="space-y-5">
        <p className="text-sm">
          {t("ui3g7.chatEndpointSetup.twoSecrets")}
        </p>
        {slackCredentialsSaved && !repairing && (
          <p className="text-sm text-muted-foreground">{t("ui3g7.chatEndpointSetup.credsSaved")}</p>
        )}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold"><label htmlFor="slack-bot-token">{t("ui3g7.chatEndpointSetup.botUserToken")}</label></h2>
          <ul id="slack-bot-token-help" className="list-disc space-y-1 pl-5 text-sm">
            <li>
              <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                {t("ui3g7.chatEndpointSetup.slackOpenSettings")} <ExternalLink className="inline size-3" />
              </a>{t("ui3g7.chatEndpointSetup.slackAndChoose")}<strong>{slackApp.appName}</strong>.
            </li>
            <li>{t("ui3g7.chatEndpointSetup.slackChoose")}<strong>OAuth &amp; Permissions</strong></li>
            <li>{t("ui3g7.chatEndpointSetup.copyPasteYour")}<strong>Bot OAuth Token</strong></li>
          </ul>
          <Input
            id="slack-bot-token"
            type="password"
            placeholder={slackCredentialsSaved ? t("ui3g7.chatEndpointSetup.savedPlaceholder") : undefined}
            value={credentials.botToken ?? ""}
            aria-invalid={slackBotTokenInvalid || undefined}
            aria-describedby={`slack-bot-token-help${slackBotTokenInvalid ? " slack-bot-token-warning" : ""}`}
            onChange={(event) => setCredentials({ ...credentials, botToken: event.target.value })}
          />
          {slackBotTokenInvalid && (
            <p id="slack-bot-token-warning" role="alert" className="text-sm text-destructive">
              {t("ui3g7.chatEndpointSetup.tokenPrefixStart")}<code>xoxb-</code>{t("ui3g7.chatEndpointSetup.tokenPrefixMid")}<strong>OAuth &amp; Permissions</strong>{t("ui3g7.chatEndpointSetup.tokenPrefixEnd")}
            </p>
          )}
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold"><label htmlFor="slack-signing-secret">{t("ui3g7.chatEndpointSetup.signingSecret")}</label></h2>
          <ul id="slack-signing-secret-help" className="list-disc space-y-1 pl-5 text-sm">
            <li>
              <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                {t("ui3g7.chatEndpointSetup.slackOpenSettings")} <ExternalLink className="inline size-3" />
              </a>{t("ui3g7.chatEndpointSetup.slackAndChoose")}<strong>{slackApp.appName}</strong>.
            </li>
            <li>{t("ui3g7.chatEndpointSetup.slackChoose")}<strong>Basic Information</strong></li>
            <li>{t("ui3g7.chatEndpointSetup.copyPasteYour")}<strong>Signing Secret</strong></li>
          </ul>
          <Input
            id="slack-signing-secret"
            type="password"
            placeholder={slackCredentialsSaved ? t("ui3g7.chatEndpointSetup.savedPlaceholder") : undefined}
            value={credentials.signingSecret ?? ""}
            aria-invalid={slackSigningSecretHasTokenPrefix || undefined}
            aria-describedby={`slack-signing-secret-help${slackSigningSecretHasTokenPrefix ? " slack-signing-secret-warning" : ""}`}
            onChange={(event) => setCredentials({ ...credentials, signingSecret: event.target.value })}
          />
          {slackSigningSecretHasTokenPrefix && (
            <p id="slack-signing-secret-warning" role="alert" className="text-sm text-destructive">
              {t("ui3g7.chatEndpointSetup.useSigningPrefix")}<strong>Signing Secret</strong>{t("ui3g7.chatEndpointSetup.useSigningSuffix")}
            </p>
          )}
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" className="text-muted-foreground" onClick={() => navigate("/apps")}>
            {t("ui3g7.chatEndpointSetup.saveExit")}
          </Button>
          <Button
            className="ml-auto"
            disabled={
              (!repairing && !slackCredentialsSaved && (!slackBotToken || !credentials.signingSecret?.trim())) ||
              !endpoint.setup?.webhookUrl || !slackValidation.success ||
              pending || slackSigningSecretHasTokenPrefix || slackBotTokenInvalid
            }
            onClick={() => continueWithSavedSlackCredentials
              ? onSlackCredentialsContinue()
              : onAction(repairing || slackCredentialsSaved ? "reconnect" : "configure", credentials)}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {continueWithSavedSlackCredentials ? t("ui3g7.chatEndpointSetup.continue") : repairing || slackCredentialsSaved ? t("ui3g7.chatEndpointSetup.reconnectSlackApp") : t("ui3g7.chatEndpointSetup.connectSlackApp")}
          </Button>
        </div>
      </div>}
    </div>
  );
}

function TryStep({
  endpointId,
  provider,
  agentName,
  botLabel,
  botUsername,
  slackAccount,
  photonAllocation,
  providerUrl,
  guestIsolationState,
  pending,
  onOpenAccess,
  onTest,
  onSaveExit,
}: {
  endpointId: string;
  provider: ChatProvider;
  agentName: string;
  botLabel?: string | null;
  botUsername?: string | null;
  slackAccount?: import("@paperclipai/shared").SlackAccountState;
  photonAllocation?: "dedicated" | "shared";
  providerUrl?: string | null;
  guestIsolationState: "loading" | "enabled" | "disabled" | "unknown";
  pending: boolean;
  onOpenAccess: () => void;
  onTest: () => void;
  onSaveExit: () => void;
}) {
  const { t } = useTranslation();
  const [commandCopied, setCommandCopied] = useState(false);
  const [commandCopyError, setCommandCopyError] = useState(false);
  const principalsQuery = useQuery({
    queryKey: queryKeys.chatEndpoints.principals(endpointId),
    queryFn: () => chatEndpointsApi.listPrincipals(endpointId),
    enabled: provider !== "slack",
    refetchInterval: 1_500,
  });
  const [numberCopied, setNumberCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const identities = principalsQuery.data ?? [];
  const unlinkedIdentities = identities.filter(
    (identity) => identity.status !== "linked",
  );
  const freshConversationInstruction =
    provider === "imessage-photon" ? t("ui3g7.chatEndpointSetup.freshPhoton") : provider === "telegram"
      ? t("ui3g7.chatEndpointSetup.freshTelegram")
      : provider === "github"
        ? t("ui3g7.chatEndpointSetup.freshGitHub")
        : provider === "microsoft-teams"
          ? t("ui3g7.chatEndpointSetup.freshTeams")
          : t("ui3g7.chatEndpointSetup.freshDefault");
  const identityGuidance = provider === "slack" ? null : provider === "imessage-photon" && principalsQuery.isSuccess && (identities.length === 0 || unlinkedIdentities.length > 0)
    ? { tone: "info" as const, title: t("ui3g7.chatEndpointSetup.photonLinkTitle"), body: t("ui3g7.chatEndpointSetup.photonLinkBody") }
    : principalsQuery.isError
    ? {
        tone: "warning" as const,
        title: t("ui3g7.chatEndpointSetup.identityCheckFailedTitle"),
        body: t("ui3g7.chatEndpointSetup.identityCheckFailedBody", { instruction: freshConversationInstruction }),
      }
    : !principalsQuery.isSuccess || guestIsolationState === "loading"
      ? null
      : identities.length === 0
        ? guestIsolationState === "disabled"
          ? {
              tone: "warning" as const,
              title: t("ui3g7.chatEndpointSetup.linkTestedTitle"),
              body:
                provider === "telegram"
                  ? t("ui3g7.chatEndpointSetup.telegramDisabledBody")
                  : t("ui3g7.chatEndpointSetup.disabledBody", { provider: providerNames[provider], agent: agentName, instruction: freshConversationInstruction }),
            }
          : {
              tone: "info" as const,
              title: t("ui3g7.chatEndpointSetup.firstMessageTitle"),
              body:
                provider === "telegram"
                  ? t("ui3g7.chatEndpointSetup.telegramFirstBody")
                  : t("ui3g7.chatEndpointSetup.unlinkedGuestBody", { instruction: freshConversationInstruction }),
            }
        : unlinkedIdentities.length > 0
          ? guestIsolationState === "disabled"
            ? {
                tone: "warning" as const,
                title: t("ui3g7.chatEndpointSetup.linkTestedTitle"),
                body: t("ui3g7.chatEndpointSetup.unlinkedDisabledBody", { agent: agentName, instruction: freshConversationInstruction }),
              }
            : {
                tone: "info" as const,
                title: t("ui3g7.chatEndpointSetup.unlinkedDetectedTitle"),
                body: t("ui3g7.chatEndpointSetup.unlinkedEnabledBody", { instruction: freshConversationInstruction }),
              }
          : null;
  const providerBotUsername = botUsername?.replace(/^@/, "");
  const normalizedBotUsername =
    provider === "github"
      ? providerBotUsername?.replace(/\[bot\]$/i, "")
      : providerBotUsername;
  const botMention = normalizedBotUsername
    ? `@${normalizedBotUsername}`
    : (botLabel ?? agentName);
  const slackTestMessage = slackAccount?.status === "linked" ? "you there?" : `${botMention.startsWith("@") ? botMention : `@${botMention}`} you there?`;
  const instructions =
    provider === "imessage-photon" ? [
      photonAllocation === "shared" ? t("ui3g7.chatEndpointSetup.photonShared") : t("ui3g7.chatEndpointSetup.photonDedicated", { target: botUsername ?? botLabel ?? t("ui3g7.chatEndpointSetup.theDedicatedNumber") }),
      t("ui3g7.chatEndpointSetup.photonLinkStep"),
      t("ui3g7.chatEndpointSetup.photonWait"),
      ...(photonAllocation === "shared" ? [t("ui3g7.chatEndpointSetup.photonSharedDm")] : [t("ui3g7.chatEndpointSetup.photonGroup")]),
    ] : provider === "discord"
      ? [
          t("ui3g7.chatEndpointSetup.discordStepOpen"),
          t("ui3g7.chatEndpointSetup.discordMention", { mention: botMention }),
          t("ui3g7.chatEndpointSetup.discordReply", { agent: agentName }),
        ]
      : provider === "telegram"
        ? [
            t("ui3g7.chatEndpointSetup.telegramOpenChat"),
            t("ui3g7.chatEndpointSetup.telegramTapStart"),
            t("ui3g7.chatEndpointSetup.telegramSend"),
          ]
        : provider === "github"
          ? [
              t("ui3g7.chatEndpointSetup.githubOpen"),
              t("ui3g7.chatEndpointSetup.githubMention", { mention: botMention }),
              t("ui3g7.chatEndpointSetup.githubAddComment"),
            ]
          : provider === "microsoft-teams"
            ? [
                t("ui3g7.chatEndpointSetup.teamsOpenChannel"),
                t("ui3g7.chatEndpointSetup.teamsMention", { mention: botMention }),
                t("ui3g7.chatEndpointSetup.teamsReply"),
              ]
            : [
                t("ui3g7.chatEndpointSetup.openChannelInvite", { mention: botMention }),
                t("ui3g7.chatEndpointSetup.defaultMention", { mention: botMention }),
                t("ui3g7.chatEndpointSetup.defaultReply", { agent: agentName }),
              ];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">
          {t("ui3g7.chatEndpointSetup.tryTitle", { agent: agentName, provider: providerNames[provider] })}
        </h1>
        {provider !== "slack" && <p className="mt-1 text-sm text-muted-foreground">
          {t("ui3g7.chatEndpointSetup.completeConversation")}
        </p>}
      </div>
      {provider !== "slack" && (!principalsQuery.isSuccess || guestIsolationState === "loading") &&
      !principalsQuery.isError ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("ui3g7.chatEndpointSetup.checkingIdentity")}
        </p>
      ) : null}
      {identityGuidance ? (
        <div
          role={identityGuidance.tone === "warning" ? "alert" : "status"}
          className={
            identityGuidance.tone === "warning"
              ? "rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm"
              : "rounded-lg border border-border bg-muted/30 p-4 text-sm"
          }
        >
          <h2 className="font-medium">{identityGuidance.title}</h2>
          <p className="mt-1 text-muted-foreground">{identityGuidance.body}</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={onOpenAccess}
          >
            {t("ui3g7.chatEndpointSetup.reviewIdentity")}
          </Button>
        </div>
      ) : null}
      {provider === "imessage-photon" && botUsername && <div className="space-y-2"><Button variant="outline" onClick={() => { void copyTextToClipboard(botUsername).then(() => { setNumberCopied(true); setCopyError(null); }, () => setCopyError(t("ui3g7.chatEndpointSetup.copyNumberError"))); }}>{numberCopied ? t("ui3g7.chatEndpointSetup.numberCopied") : t("ui3g7.chatEndpointSetup.copyNumber", { number: botUsername })}</Button>{copyError && <p role="alert" className="text-sm text-destructive">{copyError}</p>}</div>}
      {provider === "slack" ? (
        <>
          <ol className="list-decimal space-y-4 pl-5 text-sm">
            <li>{slackAccount?.status === "linked" ? <Button asChild variant="outline"><a href={providerUrl ?? "https://app.slack.com"} target="_blank" rel="noopener noreferrer">{slackAccount.dmChannelId ? t("ui3g7.chatEndpointSetup.openSlackDm") : t("ui3g7.chatEndpointSetup.openSlack")}<ExternalLink /></a></Button> : <>{t("ui3g7.chatEndpointSetup.openChannelInvite", { mention: botMention })}</>}</li>
            <li>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <code>{slackTestMessage}</code>
                <Button size="sm" variant="ghost" onClick={() => {
                  void copyTextToClipboard(slackTestMessage).then(() => { setCommandCopied(true); setCommandCopyError(false); }, () => setCommandCopyError(true));
                }}><Copy className="size-4" />{commandCopied ? t("ui3g7.chatEndpointSetup.copied") : t("ui3g7.chatEndpointSetup.copyMessage")}</Button>
              </div>
              {slackAccount?.status !== "linked" && <p className="mt-2 text-muted-foreground">{t("ui3g7.chatEndpointSetup.selectBot")}</p>}
            </li>
            <li>{t("ui3g7.chatEndpointSetup.continueThread")}</li>
          </ol>
          {commandCopyError && <p role="alert" className="text-sm text-destructive">{t("ui3g7.chatEndpointSetup.copyCommandError")}</p>}
          <SetupWizardFooter onSaveExit={onSaveExit} disabled={pending}>
            <Button disabled={pending} onClick={onTest}>{pending && <Loader2 className="size-4 animate-spin" />}{t("ui3g7.chatEndpointSetup.done")}</Button>
          </SetupWizardFooter>
        </>
      ) : <>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        {instructions.map((item) => <li key={item}>{item}</li>)}
      </ol>
      <div className="flex flex-wrap gap-2">
        {providerUrl && (
          <Button asChild variant="outline">
            <a href={providerUrl} target="_blank" rel="noopener noreferrer">
              {t("ui3g7.chatEndpointSetup.openProvider", { provider: providerNames[provider] })} <ExternalLink />
            </a>
          </Button>
        )}
        <Button disabled={pending} onClick={onTest}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("ui3g7.chatEndpointSetup.sentTest")}
        </Button>
      </div>
      </>}
    </div>
  );
}
