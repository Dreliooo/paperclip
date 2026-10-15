import { t, useTranslation } from "@/i18n";
import { SpekoPhoneLine } from "@/components/voice/SpekoPhoneLine";
import { SpekoIncomingCalls } from "@/components/voice/SpekoIncomingCalls";
import { SpekoCallActivityItem, SpekoUnapprovedCallActivityItem, useSpekoCallHistory } from "@/components/voice/SpekoCallHistory";
import { SpekoPhoneCallback } from "@/components/voice/SpekoPhoneCallback";
import { deriveInitials } from "@/components/Identity";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { agentAvatarUrl } from "@/lib/agent-avatar-url";
import { resolveAgentAppearance } from "@paperclipai/shared";
import { SlackTestMessageButton } from "./SlackTestMessageButton";
import { AgentAvatar } from "@/components/AgentAvatar";
import { SlackSetupAdvanced } from "./SlackAppDetails";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SlackToolsSettings, SlackSearchAccess } from "./SlackToolSettings";
import { ChatCommunicationInstructions } from "./ChatCommunicationInstructions";
import { ChatExecutionDefaults } from "./ChatExecutionDefaults";
import { agentsApi } from "@/api/agents";
import { ChatConversationList } from "./ChatConversationList";
import { GitHubBotManagement, GitHubReviews } from "./GitHubBotManagement";
import { GitHubBotMention, GitHubAppIdentityActions } from "./GitHubAppIdentity";
import { GitHubConnectionComplete, type GitHubConnectionCompleteLocationState } from "./GitHubConnectionComplete";
import { EmailEndpointSettings } from "./EmailEndpointSetup";
import { EmailConnectionAccess } from "@/components/EmailConnectionAccess";
import { emailApi } from "@/api/email";
import { toolsApi } from "@/api/tools";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Check,
  Activity as ActivityIcon,
  Copy,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  Unlink,
} from "lucide-react";
import {
  chatEndpointsApi,
  type ChatActivityItem,
  type ChatEndpoint,
  type ChatEndpointResource,
  type ChatProvider,
} from "@/api/chatEndpoints";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { AppLogo } from "../AppLogo";
import { StatusBadge } from "@/components/StatusBadge";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { formatDateTime } from "@/lib/utils";
import { queryKeys } from "@/lib/queryKeys";
import { copyTextToClipboard } from "@/lib/clipboard";
import { Link, Navigate, useLocation, useNavigate, useParams } from "@/lib/router";

const tabs = ["settings", "access", "reviews", "conversations", "activity"] as const;
type ChatTab = (typeof tabs)[number];
const tabItems = tabs.map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));
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

const providerLifecycleGuidance: Record<
  ChatProvider,
  { reconnect: string; remove: string }
> = {
  speko: {
    reconnect: t("ui3g6.ChatEndpointDetail.reverifyThisVoicePersonaAnd"),
    remove: t("ui3g6.ChatEndpointDetail.stopThisConnectionFromAccepting"),
  },
  agentmail: { reconnect: t("ui3g6.ChatEndpointDetail.reconnectTheSameEmailInbox"), remove: t("ui3g6.ChatEndpointDetail.disconnectEmailAndRetainTask") },
  slack: {
    reconnect:
      t("ui3g6.ChatEndpointDetail.reconnectVerifiesOrReplacesCredentials"),
    remove:
      t("ui3g6.ChatEndpointDetail.paperclipArchivesTheEndpointStops"),
  },
  github: {
    reconnect:
      t("ui3g6.ChatEndpointDetail.reconnectVerifiesThisSameApp"),
    remove:
      t("ui3g6.ChatEndpointDetail.paperclipArchivesTheEndpointStops2"),
  },
  discord: {
    reconnect:
      t("ui3g6.ChatEndpointDetail.reconnectVerifiesThisSameDiscord"),
    remove:
      t("ui3g6.ChatEndpointDetail.paperclipArchivesTheEndpointStops3"),
  },
  "microsoft-teams": {
    reconnect:
      t("ui3g6.ChatEndpointDetail.reconnectVerifiesThisSameMicrosoft"),
    remove:
      t("ui3g6.ChatEndpointDetail.paperclipArchivesTheEndpointStops4"),
  },
  "imessage-photon": {
    reconnect: t("ui3g6.ChatEndpointDetail.reconnectVerifiesTheSamePhoton"),
    remove: t("ui3g6.ChatEndpointDetail.disconnectArchivesThisChannelAnd"),
  },
  telegram: {
    reconnect:
      t("ui3g6.ChatEndpointDetail.reconnectVerifiesThisSameBotfather"),
    remove:
      t("ui3g6.ChatEndpointDetail.paperclipArchivesTheEndpointAnd"),
  },
};

const activityKindLabels: Record<ChatActivityItem["kind"], string> = {
  delivery: t("ui3g6.ChatEndpointDetail.inboundDelivery"),
  publication: t("ui3g6.ChatEndpointDetail.outboundPublication"),
  action: t("ui3g6.ChatEndpointDetail.providerAction"),
  health: t("ui3g6.ChatEndpointDetail.connectionHealth"),
  repair: t("ui3g6.ChatEndpointDetail.connectionRepair"),
};

const replayableFailureStates = new Set(["failed"]);
// Provider callbacks do not necessarily emit a Board activity event. Refresh
// only mounted operational views, and stop polling when the browser is hidden.
const liveChatQueryOptions = {
  staleTime: 0,
  refetchInterval: 5_000,
  refetchIntervalInBackground: false,
} as const;

export function isReplayEligible(item: ChatActivityItem): boolean {
  if (
    item.fileTransfer ||
    !item.replayable ||
    !replayableFailureStates.has(item.status)
  ) {
    return false;
  }
  if (item.kind === "delivery") return item.status === "failed";
  return item.kind === "publication";
}

export function activityResolutionActions(item: ChatActivityItem) {
  const offered = item.resolutionActions ?? [];
  if (!item.fileTransfer) return offered;
  if (
    item.kind !== "publication" ||
    !Number.isSafeInteger(item.fileTransfer.version) ||
    item.fileTransfer.version < 1
  )
    return [];
  if (
    ![
      "consent_unknown",
      "upload_unknown",
      "file_info_unknown",
      "conflict",
    ].includes(item.fileTransfer.phase)
  )
    return [];
  // Only the file-info stage can use ordinary visible-delivery resolution.
  // Earlier consent/upload evidence must not be fabricated by these buttons.
  return item.fileTransfer.phase === "file_info_unknown"
    ? offered
    : offered.filter((action) => action === "cancel");
}

export function activityResolutionDescription(item: ChatActivityItem): string {
  const phase = item.fileTransfer?.phase;
  if (phase === "file_info_unknown")
    return t("ui3g6.ChatEndpointDetail.theFileUploadWasConfirmed");
  if (phase === "consent_unknown")
    return t("ui3g6.ChatEndpointDetail.theConsentCardMayHave");
  if (phase)
    return t("ui3g6.ChatEndpointDetail.theFileMayAlreadyExist");
  return t("ui3g6.ChatEndpointDetail.paperclipLostConfirmationAfterSending");
}

export function isResolutionEligible(item: ChatActivityItem): boolean {
  return (
    (item.kind === "publication" || item.kind === "action") &&
    item.status === "delivery_unknown" &&
    activityResolutionActions(item).length > 0
  );
}

export function isIndividuallyToggleableResource(
  provider: ChatProvider,
  resourceType: string,
): boolean {
  return !(
    provider === "microsoft-teams" &&
    (resourceType === "direct_message" || resourceType === "group_chat")
  );
}

function activityDetailLabel(item: ChatActivityItem): string {
  return replayableFailureStates.has(item.status) ? t("ui3g6.ChatEndpointDetail.reason") : t("ui3g6.ChatEndpointDetail.details");
}

export function connectionHealthPresentation(
  endpoint: Pick<ChatEndpoint, "status" | "healthMessage" | "lastError">,
) {
  // Health events outlive pause/removal. They are history, not lifecycle state.
  const lifecycleMessages = {
    draft: t("ui3g6.ChatEndpointDetail.connectionSetupIsIncomplete"),
    verifying: t("ui3g6.ChatEndpointDetail.connectionVerificationIsInProgress"),
    paused: t("ui3g6.ChatEndpointDetail.connectionIsPausedResumeIt"),
    attention: t("ui3g6.ChatEndpointDetail.connectionNeedsAttention"),
    revoked: t("ui3g6.ChatEndpointDetail.connectionAccessIsRevokedReconnect"),
    archived: t("ui3g6.ChatEndpointDetail.connectionHasBeenRemovedFrom"),
  };
  const lifecycleMessage =
    endpoint.status === "active" ? null : lifecycleMessages[endpoint.status];
  return {
    message: lifecycleMessage ?? endpoint.healthMessage ?? null,
    previousHealth: lifecycleMessage ? (endpoint.healthMessage ?? null) : null,
    error: endpoint.lastError ?? null,
    errorLabel: ["active", "attention", "revoked"].includes(endpoint.status)
      ? t("ui3g6.ChatEndpointDetail.reason")
      : t("ui3g6.ChatEndpointDetail.lastReportedError"),
  };
}

export function ChatEndpointDetail() {
  const { t } = useTranslation();
  const { endpointId = "", tab: routeTab, reviewId } = useParams<{
    endpointId: string;
    tab?: string;
    reviewId?: string;
  }>();
  const tab = reviewId ? "reviews" : (routeTab ?? "settings");
  const activeTab = tabs.includes(tab as ChatTab) ? (tab as ChatTab) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const heading = useRef<HTMLHeadingElement>(null);
  const completion = (location.state as GitHubConnectionCompleteLocationState | null)?.githubConnectionComplete;
  const { setBreadcrumbs } = useBreadcrumbs();
  const endpointQuery = useQuery({
    queryKey: queryKeys.chatEndpoints.detail(endpointId),
    queryFn: () => chatEndpointsApi.get(endpointId),
    enabled: Boolean(endpointId && activeTab),
    ...liveChatQueryOptions,
    refetchInterval:
      activeTab === "activity" || activeTab === "conversations"
        ? liveChatQueryOptions.refetchInterval
        : false,
  });
  const endpoint = endpointQuery.data;
  const avatarAgent = useQuery({
    queryKey: queryKeys.agents.detail(endpoint?.assignedAgentId ?? ""),
    queryFn: () => agentsApi.get(endpoint!.assignedAgentId),
    enabled: endpoint?.provider === "github",
  });
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const agentQuery = useQuery({
    queryKey: queryKeys.agents.detail(endpoint?.assignedAgentId ?? ""),
    queryFn: () => agentsApi.get(endpoint!.assignedAgentId, endpoint!.companyId),
    enabled: Boolean(endpoint?.assignedAgentId),
  });

  useEffect(() => {
    if (!endpoint || !activeTab) return;
    setBreadcrumbs([
      { label: t("ui3g6.ChatEndpointDetail.connectors"), href: "/apps" },
      {
        label: `${endpoint.assignedAgentName} · ${providerNames[endpoint.provider]}`,
        href: `/apps/chat/${endpoint.id}/settings`,
      },
      ...(reviewId ? [{ label: t("ui3g6.ChatEndpointDetail.reviews"), href: `/apps/chat/${endpoint.id}/reviews` }, { label: t("ui3g6.ChatEndpointDetail.review") }] : [{
        label:
          tabItems.find((item) => item.value === activeTab)?.label ??
          t("ui3g6.ChatEndpointDetail.settings"),
      }]),
    ]);
    return () => setBreadcrumbs([]);
  }, [activeTab, endpoint, reviewId, setBreadcrumbs]);

  if (!activeTab)
    return <Navigate replace to={`/apps/chat/${endpointId}/settings`} />;
  if (endpointQuery.isLoading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("ui3g6.ChatEndpointDetail.loadingConnection")}
      </div>
    );
  if (endpointQuery.isError || !endpoint)
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">
          {t("ui3g6.ChatEndpointDetail.thisChatConnectionCouldNot")}
        </p>
        <Button variant="outline" onClick={() => endpointQuery.refetch()}>
          {t("ui3g6.ChatEndpointDetail.tryAgain")}
        </Button>
      </div>
    );
  if (endpoint.provider === "agentmail" && activeTab === "settings")
    return <div className="space-y-7"><EmailEndpointSettings key={endpoint.id} endpointId={endpoint.id} companyId={endpoint.companyId} assignedAgentName={endpoint.assignedAgentName} /><EndpointExecutionDefaults endpoint={endpoint} /></div>;
  const setupIncomplete =
    endpoint.setup?.step !== "complete" &&
    !(endpoint.provider === "slack" && endpoint.setup?.step === "test") &&
    ["draft", "verifying", "attention", "revoked"].includes(endpoint.status);
  const slackAppId = endpoint.setup?.slackRegistration?.appId;
  const slackUrl = endpoint.provider === "slack"
    ? slackAppId ? `https://api.slack.com/apps/${encodeURIComponent(slackAppId)}/oauth` : "https://api.slack.com/apps"
    : null;

  return (
    <div className="max-w-5xl space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <AgentAvatar agent={agentQuery.data ?? { id: endpoint.assignedAgentId, name: endpoint.assignedAgentName }} size={endpoint.provider === "github" ? 64 : 48} />
          <div className="min-w-0">
          <h1 ref={heading} tabIndex={-1} className={endpoint.provider === "speko" ? "flex items-center gap-3 text-xl font-bold" : "text-xl font-bold"}>
            {endpoint.provider === "speko" && <AppLogo name="Speko" brandKey="speko" size={36} />}
            {endpoint.provider === "github" ? (endpoint.botLabel ?? endpoint.assignedAgentName) : endpoint.assignedAgentName}{endpoint.provider === "speko" ? t("ui3g6.ChatEndpointDetail.inSpeko") : ""}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {endpoint.provider === "github" ? <><AppLogo name="GitHub" brandKey="github" compact className="size-4! rounded-sm bg-transparent" /><Link to={`/agents/${endpoint.assignedAgentId}`} className="hover:underline">{endpoint.assignedAgentName}</Link>{endpoint.providerAccountLabel && <span>· {endpoint.providerAccountLabel}</span>}</> : endpoint.providerAccountLabel ?? (endpoint.provider === "agentmail" ? endpoint.botExternalId ?? t("ui3g6.ChatEndpointDetail.emailConnection") : t("ui3g6.ChatEndpointDetail.chatConnection"))}
          </p>
          {endpoint.provider === "github" && <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <GitHubBotMention endpoint={endpoint} />
            <GitHubAppIdentityActions endpoint={endpoint} avatarUrl={avatarAgent.data ? agentAvatarUrl(resolveAgentAppearance(avatarAgent.data.appearance, endpoint.assignedAgentId), 512, 1, "rest") : undefined} />
          </div>}
          {endpoint.provider === "imessage-photon" && endpoint.botExternalId && endpoint.photonAllocation !== "shared" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span>{endpoint.botExternalId}</span>
              <Button variant="ghost" size="sm" aria-label={t("ui3g6.ChatEndpointDetail.copyDedicatedNumber")} onClick={async () => {
                try { await copyTextToClipboard(endpoint.botExternalId!); setCopyStatus(t("ui3g6.ChatEndpointDetail.numberCopied")); }
                catch { setCopyStatus(t("ui3g6.ChatEndpointDetail.couldNotCopyTheNumber")); }
              }}><Copy className="size-4" />{t("ui3g6.ChatEndpointDetail.copyNumber")}</Button>
              <span role="status" className="text-muted-foreground">{copyStatus}</span>
            </div>
          )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {endpoint.provider === "speko" && <a href="https://platform.speko.ai/agents" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline">{t("ui3g6.ChatEndpointDetail.openSpeko")}<ExternalLink className="size-3.5" aria-hidden="true" /></a>}
          {slackUrl && <Button asChild variant="outline"><a href={slackUrl} target="_blank" rel="noopener noreferrer">{t("ui3g6.ChatEndpointDetail.openSlackConfiguration")} <ExternalLink className="size-4" /></a></Button>}
          {setupIncomplete ? (
            <Button
              variant="outline"
              onClick={() =>
                navigate(
                  `/apps/chat/connect?provider=${endpoint.provider}&purpose=chat&resume=${endpoint.id}`,
                )
              }
            >
              {t("ui3g6.ChatEndpointDetail.continueSetup")}
            </Button>
          ) : null}
          {endpoint.status !== "active" && <StatusBadge status={endpoint.status} className={endpoint.provider === "speko" ? "text-foreground" : undefined} />}
        </div>
      </header>
      {activeTab === "settings" && endpoint.provider === "speko" && endpoint.status === "active" && <div className="space-y-6"><SpekoPhoneCallback companyId={endpoint.companyId} endpointId={endpoint.id} /><SpekoPhoneLine companyId={endpoint.companyId} endpointId={endpoint.id} /><SpekoIncomingCalls companyId={endpoint.companyId} endpointId={endpoint.id} agentId={endpoint.assignedAgentId} /></div>}
      {endpoint.provider === "slack" && <SlackTestMessageButton key={endpoint.id} endpointId={endpoint.id} />}
      {endpoint.provider === "github" && <div hidden={activeTab !== "settings" && activeTab !== "access"}>
        <GitHubBotManagement key={endpoint.id} endpoint={endpoint} view={activeTab === "access" ? "access" : "settings"} />
      </div>}
      {activeTab === "settings" && endpoint.provider !== "github" && <Settings endpointId={endpoint.id} endpoint={endpoint} />}
      {activeTab === "settings" && <EndpointExecutionDefaults endpoint={endpoint} />}
      {activeTab === "reviews" && endpoint.provider === "github" && <GitHubReviews endpointId={endpoint.id} reviewId={reviewId} />}
      {activeTab === "access" && endpoint.provider === "speko" && (
        <section className="max-w-3xl space-y-3">
          <h2 className="text-lg font-semibold">{t("ui3g6.ChatEndpointDetail.privateVoiceAccess")}</h2>
          <p className="text-sm text-muted-foreground">Browser calls use the signed-in Paperclip user’s current company access. Each call stays bound to its selected agent and task.</p>
          <p className="text-sm text-muted-foreground">Outgoing calls use your saved callback number and opt-in. For a private incoming call, enter the code spoken on the phone in signed-in Paperclip and select a task to approve that live call. Incoming calls can start a new conversation task without sign-in, under a task-scoped low-trust policy. Private mode is optional and requires approval before accessing existing tasks.</p>
        </section>
      )}
{activeTab === "access" && endpoint.provider === "agentmail" && <EmailAccess endpoint={endpoint} />}
{activeTab === "access" && endpoint.provider !== "speko" && endpoint.provider !== "github" && endpoint.provider !== "agentmail" && (
        <Access
          endpointId={endpoint.id}
          allowUnlinked={endpoint.allowUnlinkedPeople}
          endpoint={endpoint}
        />
      )}
      {activeTab === "conversations" && (
        <Conversations endpointId={endpoint.id} provider={endpoint.provider} />
      )}
      {activeTab === "activity" && (
        <Activity endpointId={endpoint.id} endpoint={endpoint} />
      )}
      {endpoint.provider === "github" && activeTab === "settings" && endpoint.status === "active" &&
        endpoint.setup?.step === "complete" && completion?.endpointId === endpoint.id && (
        <GitHubConnectionComplete
          endpoint={endpoint}
          agent={avatarAgent.data}
          runtimeChecks={completion.runtimeChecks}
          onClose={() => {
            const { githubConnectionComplete: _complete, ...rest } = location.state as GitHubConnectionCompleteLocationState;
            navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: rest });
          }}
          onCloseAutoFocus={() => heading.current?.focus()}
        />
      )}
    </div>
  );
}

function EndpointExecutionDefaults({ endpoint }: { endpoint: ChatEndpoint }) {
  const queryClient = useQueryClient();
  return <section className="max-w-3xl py-5"><ChatExecutionDefaults
    key={endpoint.id}
    companyId={endpoint.companyId}
    value={endpoint.executionDefaults}
    onSave={async (executionDefaults) => {
      const next = await chatEndpointsApi.update(endpoint.id, { executionDefaults });
      queryClient.setQueryData(queryKeys.chatEndpoints.detail(endpoint.id), next);
    }}
  /></section>;
}

function EmailAccess({ endpoint }: { endpoint: ChatEndpoint }) {
  const { t } = useTranslation();
  const connection = useQuery({
    queryKey: queryKeys.tools.connection(endpoint.connectionId ?? ""),
    queryFn: () => toolsApi.getConnection(endpoint.connectionId!),
    enabled: Boolean(endpoint.connectionId),
  });
  const agents = useQuery({
    queryKey: queryKeys.agents.list(endpoint.companyId),
    queryFn: () => agentsApi.list(endpoint.companyId),
  });
  if (!endpoint.connectionId || agents.isError || connection.isError) return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-destructive">{t("ui3g6.ChatEndpointDetail.connectionAccessCouldNotBe")}</p>
      <Button variant="outline" onClick={() => { void agents.refetch(); void connection.refetch(); }}>{t("ui3g6.ChatEndpointDetail.tryAgain")}</Button>
    </div>
  );
  if (agents.isPending || connection.isPending) return <p role="status" className="text-sm text-muted-foreground">{t("ui3g6.ChatEndpointDetail.loadingAccess")}</p>;
  const sourceId = connection.data.config?.credentialConnectionId;
  const credentialId = typeof sourceId === "string" ? sourceId : endpoint.connectionId;
  return <section className="max-w-3xl space-y-4">
    <h2 className="text-lg font-semibold">{t("ui3g6.ChatEndpointDetail.access")}</h2>
    {credentialId !== endpoint.connectionId && <p className="text-sm text-muted-foreground">{t("ui3g6.ChatEndpointDetail.theseSettingsApplyToThe")}</p>}
    <EmailConnectionAccess key={credentialId} companyId={endpoint.companyId} connectionId={credentialId} agents={agents.data} />
  </section>;
}

function Settings({
  endpointId,
  endpoint,
}: {
  endpointId: string;
  endpoint: Awaited<ReturnType<typeof chatEndpointsApi.get>>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const resourcesQuery = useQuery({
    queryKey: queryKeys.chatEndpoints.resources(endpointId),
    queryFn: () => chatEndpointsApi.listResources(endpointId),
    enabled: endpoint.provider !== "speko",
    ...(endpoint.provider === "slack" ? liveChatQueryOptions : {}),
  });
  const saveResources = useMutation({
    mutationFn: (resource: Pick<ChatEndpointResource, "id" | "enabled">) =>
      chatEndpointsApi.updateResources(endpointId, [resource]),
    onSuccess: (resources) =>
      queryClient.setQueryData(
        queryKeys.chatEndpoints.resources(endpointId),
        resources,
      ),
    onError: (error) =>
      pushToast({
        title: t("ui3g6.ChatEndpointDetail.couldnTUpdateDestination"),
        body: error instanceof Error ? error.message : t("ui3g6.ChatEndpointDetail.tryAgain2"),
        tone: "error",
      }),
  });
  const updateEndpoint = useMutation({
    mutationFn: chatEndpointsApi.update.bind(null, endpointId),
    onSuccess: (next) =>
      queryClient.setQueryData(
        queryKeys.chatEndpoints.detail(endpointId),
        next,
      ),
    onError: (error) =>
      pushToast({
        title: t("ui3g6.ChatEndpointDetail.couldnTUpdateSettings"),
        body: error instanceof Error ? error.message : t("ui3g6.ChatEndpointDetail.tryAgain2"),
        tone: "error",
      }),
  });
  if (endpoint.provider === "speko") return null;
  const resources = resourcesQuery.data ?? [];
  const destinationResources = resources.filter((resource) =>
    isIndividuallyToggleableResource(endpoint.provider, resource.type),
  );
  const toggleResource = (resource: ChatEndpointResource, enabled: boolean) =>
    // A cached inventory must not overwrite another operator's unrelated edits.
    saveResources.mutate({ id: resource.id, enabled });
  return (
    <section className="max-w-3xl space-y-7">
      {endpoint.provider === "imessage-photon" && <p className="text-sm text-muted-foreground">{endpoint.photonAllocation === "shared" ? t("ui3g6.ChatEndpointDetail.sharedPhotonProject") : t("ui3g6.ChatEndpointDetail.enableEachGroupIndividuallyAgent")}</p>}
      {endpoint.provider === "telegram" && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("ui3g6.ChatEndpointDetail.telegramGroupCommand")}</h2>
          <div className="rounded-lg border border-border p-3 text-sm">
            <code>
              /task@
              {endpoint.botUsername?.replace(/^@/, "") ?? "bot_username"}{" "}
              &lt;request&gt;
            </code>
            <p className="mt-2 text-muted-foreground">
              Telegram&apos;s default privacy mode does not deliver ordinary
              mentions to bots. Use this command to start or continue group
              work, or reply directly to a message from the bot.
            </p>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{endpoint.provider === "slack" ? t("ui3g6.ChatEndpointDetail.allowedChannels") : t("ui3g6.ChatEndpointDetail.destinations")}</h3>
        {resourcesQuery.isError ? <p role="alert" className="text-sm text-destructive">{t("ui3g6.ChatEndpointDetail.couldnTLoadChannels")} <button className="underline" onClick={() => void resourcesQuery.refetch()}>{t("ui3g6.ChatEndpointDetail.tryAgain")}</button></p> : resourcesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("ui3g6.ChatEndpointDetail.loadingDestinations")}</p>
        ) : destinationResources.length === 0 && endpoint.provider !== "slack" ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t("ui3g6.ChatEndpointDetail.noDestinationsYet")}
          </p>
        ) : (
          <div className={endpoint.provider === "slack" ? "space-y-1" : "divide-y divide-border border-y border-border"}>
            {destinationResources.map((resource) => (
              <div key={resource.id} className="py-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {resource.label}
                  </p>
                  {(resource.availability !== "available" || resource.detail) && <p className="text-xs text-muted-foreground">
                    {resource.availability === "available"
                      ? resource.detail
                      : t("ui3g6.ChatEndpointDetail.unavailableAtTheProvider")}
                  </p>}
                  {resource.participants?.length ? <p className="mt-1 break-words text-xs text-muted-foreground">Participants: {resource.participants.join(", ")}</p> : null}
                </div>
                <ToggleSwitch
                  aria-label={`Enable ${resource.label}`}
                  checked={resource.enabled}
                  disabled={
                    endpoint.photonAllocation === "shared" ||
                    resource.availability !== "available" ||
                    saveResources.isPending
                  }
                  onCheckedChange={(enabled) =>
                    toggleResource(resource, enabled)
                  }
                />
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">{t("ui3g6.ChatEndpointDetail.taskDefaults")}</summary>
                <div className="pt-3"><ChatExecutionDefaults
                  companyId={endpoint.companyId}
                  value={resource.executionDefaults}
                  resource
                  onSave={async (executionDefaults) => {
                    const next = await chatEndpointsApi.updateResources(endpointId, [{ id: resource.id, executionDefaults }]);
                    queryClient.setQueryData(queryKeys.chatEndpoints.resources(endpointId), next);
                  }}
                /></div>
              </details>
              </div>
            ))}
            {endpoint.provider === "slack" && (
              <p className="py-3 text-sm text-muted-foreground">
                Invite {endpoint.assignedAgentName} to a channel to add it
              </p>
            )}
          </div>
        )}
      </div>
      {endpoint.provider !== "github" && (
        <div className="space-y-3">
          <SettingToggle
            label={t("ui3g6.ChatEndpointDetail.allowDirectMessages")}
            detail={
              endpoint.provider === "discord"
                ? t("ui3g6.ChatEndpointDetail.peopleMustAlsoEnableDirect")
                : undefined
            }
            checked={endpoint.allowDirectMessages ?? false}
            pending={updateEndpoint.isPending}
            onChange={(allowDirectMessages) =>
              updateEndpoint.mutate({ allowDirectMessages })
            }
          />
          {endpoint.provider === "slack" && (
            <SettingToggle
              label={t("ui3g6.ChatEndpointDetail.requireAtMention")}
              detail={t("ui3g6.ChatEndpointDetail.inChannelsOnlyRespondTo")}
              checked={endpoint.requireAtMention ?? false}
              pending={updateEndpoint.isPending}
              onChange={(requireAtMention) =>
                updateEndpoint.mutate({ requireAtMention })
              }
            />
          )}
          {endpoint.provider === "microsoft-teams" && (
            <SettingToggle
              label={t("ui3g6.ChatEndpointDetail.allowGroupChats")}
              detail={t("ui3g6.ChatEndpointDetail.theBotMayParticipateIn")}
              checked={endpoint.allowGroupChats ?? false}
              pending={updateEndpoint.isPending}
              onChange={(allowGroupChats) =>
                updateEndpoint.mutate({ allowGroupChats })
              }
            />
          )}
        </div>
      )}
      {endpoint.provider === "slack" && <ChatCommunicationInstructions
        key={endpoint.id}
        value={endpoint.communicationInstructions ?? ""}
        onSave={async (communicationInstructions) => {
          const next = await chatEndpointsApi.update(endpointId, { communicationInstructions });
          queryClient.setQueryData(queryKeys.chatEndpoints.detail(endpointId), next);
        }}
      />}
      {endpoint.provider === "slack" && <SlackSetupAdvanced label={t("ui3g6.ChatEndpointDetail.slackTools")}><SlackToolsSettings companyId={endpoint.companyId} endpointId={endpointId} /></SlackSetupAdvanced>}
    </section>
  );
}

function SettingToggle({
  label,
  detail,
  checked,
  pending,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  pending: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      <ToggleSwitch
        aria-label={label}
        checked={checked}
        disabled={pending}
        onCheckedChange={onChange}
      />
    </div>
  );
}

function Access({
  endpointId,
  allowUnlinked,
  endpoint,
}: {
  endpointId: string;
  allowUnlinked: boolean;
  endpoint: ChatEndpoint;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [confirmationUrl, setConfirmationUrl] = useState<string | null>(null);
  const [joinCommandCopied, setJoinCommandCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [confirmationFor, setConfirmationFor] = useState<string | null>(null);
  const joinCommand = `${endpoint.setup?.slackApp?.command ?? endpoint.setup?.command ?? "/paperclip"} connect`;
  const linksQuery = useQuery({
    queryKey: queryKeys.chatEndpoints.principals(endpointId),
    queryFn: () => chatEndpointsApi.listPrincipals(endpointId),
    refetchInterval: 5000,
  });
  const updatePolicy = useMutation({
    mutationFn: (value: boolean) =>
      chatEndpointsApi.update(endpointId, { allowUnlinkedPeople: value }),
    onSuccess: (next) =>
      queryClient.setQueryData(
        queryKeys.chatEndpoints.detail(endpointId),
        next,
      ),
    onError: (error) => pushToast({ title: t("ui3g6.ChatEndpointDetail.couldnTUpdateAccess"), body: error instanceof Error ? error.message : t("ui3g6.ChatEndpointDetail.tryAgain2"), tone: "error" }),
  });
  const createIntent = useMutation({
    mutationFn: (principalId: string) =>
      chatEndpointsApi.createLinkIntent(endpointId, principalId),
    onSuccess: ({ confirmationUrl }) => {
      setConfirmationUrl(
        new URL(confirmationUrl, window.location.origin).toString(),
      );

    },
    onError: (error) =>
      pushToast({
        title: t("ui3g6.ChatEndpointDetail.couldnTCreateIdentityLink"),
        body: error instanceof Error ? error.message : t("ui3g6.ChatEndpointDetail.tryAgain2"),
        tone: "error",
      }),
  });
  const revoke = useMutation({
    mutationFn: (principalId: string) =>
      chatEndpointsApi.revokeLink(endpointId, principalId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.chatEndpoints.principals(endpointId) }),
    onError: (error) => pushToast({ title: t("ui3g6.ChatEndpointDetail.couldnTDisconnectAccount"), body: error instanceof Error ? error.message : t("ui3g6.ChatEndpointDetail.tryAgain2"), tone: "error" }),
  });
  const links = linksQuery.data ?? [];
  return (
    <section className="max-w-3xl space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("ui3g6.ChatEndpointDetail.people")}</h2>
        {endpoint.provider === "slack" && <Dialog>
          <DialogTrigger asChild><Button>{t("ui3g6.ChatEndpointDetail.invitePeople")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite people to talk to {endpoint.assignedAgentName}</DialogTitle>
              <DialogDescription>{t("ui3g6.ChatEndpointDetail.shareTheseInstructionsWithSomeone")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <ol className="list-decimal space-y-3 pl-5">
                <li>{t("ui3g6.ChatEndpointDetail.sendPrefix")} <code className="font-mono">{joinCommand}</code> {t("ui3g6.ChatEndpointDetail.inSlack")}</li>
                <li>{t("ui3g6.ChatEndpointDetail.openTheBotSPrivate")}</li>
                <li>{t("ui3g6.ChatEndpointDetail.ifYouReNewTo")}</li>
              </ol>
              <p className="text-muted-foreground">{t("ui3g6.ChatEndpointDetail.theConfirmationLinkIsPersonal")}</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => {
                  void copyTextToClipboard(joinCommand).then(() => setJoinCommandCopied(true), () => pushToast({ title: t("ui3g6.ChatEndpointDetail.couldnTCopyTheCommand"), tone: "error" }));
                }}>{joinCommandCopied ? <Check className="size-4" /> : <Copy className="size-4" />}{joinCommandCopied ? t("ui3g6.ChatEndpointDetail.copied") : t("ui3g6.ChatEndpointDetail.copyCommand")}</Button>
                <Button onClick={() => {
                  const workspace = endpoint.providerAccountId ? `https://app.slack.com/client/${encodeURIComponent(endpoint.providerAccountId)}` : "https://app.slack.com/";
                  void copyTextToClipboard(`Talk to ${endpoint.assignedAgentName} in Slack: ${workspace}\nSend ${joinCommand}, then open the bot’s private link and sign in to Paperclip to confirm your account. If you’re new to the organization, request access for an admin to approve.`).then(() => setInviteCopied(true), () => pushToast({ title: t("ui3g6.ChatEndpointDetail.couldnTCopyInvitation"), tone: "error" }));
                }}>{inviteCopied ? <Check className="size-4" /> : <Copy className="size-4" />}{inviteCopied ? t("ui3g6.ChatEndpointDetail.invitationCopied") : t("ui3g6.ChatEndpointDetail.copyInvitation")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>}
      </div>
      <p className="text-sm text-muted-foreground">{t("ui3g6.ChatEndpointDetail.peopleWithLinkedAccountsUse")} <Link className="underline underline-offset-4" to="/company/settings/members">{t("ui3g6.ChatEndpointDetail.manageMembers")}</Link></p>
      {confirmationUrl && (
        <div className="space-y-2 border-y border-border py-3">
          <p className="text-sm font-medium">{t("ui3g6.ChatEndpointDetail.confirmPrefix")} {confirmationFor ?? t("ui3g6.ChatEndpointDetail.thisAccount")}</p>
          <p className="text-xs text-muted-foreground">{t("ui3g6.ChatEndpointDetail.shareOnlyWithThisPerson")}</p>
          <p className="break-all text-xs text-muted-foreground">
            {confirmationUrl}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void copyTextToClipboard(confirmationUrl).then(
                () =>
                  pushToast({
                    title: t("ui3g6.ChatEndpointDetail.confirmationLinkCopied"),
                    tone: "success",
                  }),
                () =>
                  pushToast({
                    title: t("ui3g6.ChatEndpointDetail.couldnTCopyTheLink"),
                    body: t("ui3g6.ChatEndpointDetail.selectAndCopyItManually"),
                    tone: "error",
                  }),
              );
            }}
          >
            <Copy />
            {t("ui3g6.ChatEndpointDetail.copyLink")}
          </Button>
        </div>
      )}
      <div className="space-y-2">
        {linksQuery.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("ui3g6.ChatEndpointDetail.loadingPeople")}</p> : linksQuery.isError ? <p role="alert" className="text-sm text-destructive">{t("ui3g6.ChatEndpointDetail.couldnTLoadPeople")} <button className="underline" onClick={() => void linksQuery.refetch()}>{t("ui3g6.ChatEndpointDetail.tryAgain")}</button></p> : links.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t("ui3g6.ChatEndpointDetail.noLinkedAccountsYetInvite")}
          </p>
        ) : (
          <div role="list" aria-label={t("ui3g6.ChatEndpointDetail.people")} className="divide-y divide-border border-y border-border">
            {links.map((link) => (
              <div
                key={link.id}
                role="listitem"
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Avatar aria-hidden="true">
                    {link.paperclipUserImage && <AvatarImage src={link.paperclipUserImage} alt="" />}
                    <AvatarFallback>{deriveInitials(link.paperclipUserLabel ?? link.externalLabel)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm" title={link.paperclipUserLabel ?? link.externalLabel}>{link.paperclipUserLabel ?? link.externalLabel}</p>
                    {(link.status !== "linked" || link.externalLabel !== link.paperclipUserLabel) && <p className="text-xs text-muted-foreground">
                      {link.status === "revoked" ? t("ui3g6.ChatEndpointDetail.disconnected") : link.status === "linked"
                        ? link.externalLabel
                        : t("ui3g6.ChatEndpointDetail.waitingForAccountConfirmation")}
                    </p>}
                  </div>
                </div>
                {link.status === "linked" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(link.principalId)}
                  >
                    <Unlink />
                    {t("ui3g6.ChatEndpointDetail.disconnect")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={createIntent.isPending}
                    onClick={() => { setConfirmationUrl(null); setConfirmationFor(link.externalLabel); createIntent.mutate(link.principalId); }}
                  >
                    {t("ui3g6.ChatEndpointDetail.createConfirmationLink")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <SlackSetupAdvanced label={t("ui3g6.ChatEndpointDetail.guestAccess")}>
        <SettingToggle label={t("ui3g6.ChatEndpointDetail.allowUnlinkedPeople")}
          detail={t("ui3g6.ChatEndpointDetail.peopleWithoutLinkedAccountsCan")}
          checked={allowUnlinked} pending={updatePolicy.isPending} onChange={value => updatePolicy.mutate(value)} />
      </SlackSetupAdvanced>
      {endpoint.provider === "slack" && <SlackSetupAdvanced label={t("ui3g6.ChatEndpointDetail.personalSlackSearch")}><SlackSearchAccess companyId={endpoint.companyId} endpointId={endpointId} /></SlackSetupAdvanced>}
    </section>
  );
}

function Conversations({
  endpointId,
  provider,
}: {
  endpointId: string;
  provider: ChatProvider;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.chatEndpoints.conversations(endpointId),
    queryFn: () => chatEndpointsApi.listConversations(endpointId),
    ...liveChatQueryOptions,
  });
  return (
    <section className="space-y-4">
      {query.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("ui3g6.ChatEndpointDetail.loadingConversations")}</p> : query.isError ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">{t("ui3g6.ChatEndpointDetail.conversationsCouldNotBeLoaded")}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>{t("ui3g6.ChatEndpointDetail.tryAgain")}</Button>
        </div>
      ) : <ChatConversationList rows={query.data ?? []} provider={provider} />}
    </section>
  );
}

function Activity({
  endpointId,
  endpoint,
}: {
  endpointId: string;
  endpoint: Awaited<ReturnType<typeof chatEndpointsApi.get>>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [resolutionItem, setResolutionItem] = useState<ChatActivityItem | null>(
    null,
  );
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursors[cursors.length - 1];
  useEffect(() => setCursors([undefined]), [endpointId]);
  const query = useQuery({
    queryKey: [...queryKeys.chatEndpoints.activity(endpointId), cursor ?? null],
    queryFn: () => chatEndpointsApi.listActivityPage(endpointId, cursor),
    ...liveChatQueryOptions,
    refetchInterval: cursor ? false : liveChatQueryOptions.refetchInterval,
  });
  const calls = useSpekoCallHistory(endpoint.companyId, endpointId, endpoint.provider === "speko" && !cursor);
  const replay = useMutation({
    mutationFn: (item: ChatActivityItem) =>
      item.kind === "publication"
        ? chatEndpointsApi.replayPublication(endpointId, item.id)
        : chatEndpointsApi.replayDelivery(endpointId, item.id),
    onSuccess: async (_result, item) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.chatEndpoints.activity(endpointId),
      });
      pushToast({
        title: `${item.kind === "publication" ? t("ui3g6.ChatEndpointDetail.publication") : t("ui3g6.ChatEndpointDetail.delivery")} queued for replay`,
        tone: "success",
      });
    },
    onError: (error) =>
      pushToast({
        title: t("ui3g6.ChatEndpointDetail.couldnTReplayActivity"),
        body: error instanceof Error ? error.message : t("ui3g6.ChatEndpointDetail.tryAgain2"),
        tone: "error",
      }),
  });
  const resolveActivity = useMutation({
    mutationFn: (input: {
      item: ChatActivityItem;
      action: "mark_delivered" | "retry_anyway" | "cancel";
    }) => {
      if (input.item.kind === "publication") {
        return chatEndpointsApi.resolvePublication(
          endpointId,
          input.item.id,
          input.action,
          input.item.fileTransfer
            ? {
                phase: input.item.fileTransfer.phase,
                version: input.item.fileTransfer.version,
              }
            : undefined,
        );
      }
      return chatEndpointsApi.resolveAction(
        endpointId,
        input.item.id,
        input.action,
      );
    },
    onSuccess: async (_result, input) => {
      setResolutionItem(null);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.chatEndpoints.activity(endpointId),
      });
      pushToast({
        title:
          input.item.actionType === "slash_task_start" &&
          input.action === "retry_anyway"
            ? t("ui3g6.ChatEndpointDetail.taskStartRetried")
            : input.item.actionType === "slash_task_start"
              ? t("ui3g6.ChatEndpointDetail.taskStartCancelled")
              : input.item.actionType === "provider_effect" &&
                  input.action === "mark_delivered"
                ? t("ui3g6.ChatEndpointDetail.providerReplyMarkedDelivered")
                : input.item.actionType === "provider_effect" &&
                    input.action === "retry_anyway"
                  ? t("ui3g6.ChatEndpointDetail.providerReplyRetried")
                  : input.item.actionType === "provider_effect"
                    ? t("ui3g6.ChatEndpointDetail.providerReplyCancelled")
                    : input.action === "mark_delivered"
                      ? t("ui3g6.ChatEndpointDetail.publicationMarkedDelivered")
                      : input.action === "retry_anyway"
                        ? t("ui3g6.ChatEndpointDetail.publicationQueuedForRetry")
                        : t("ui3g6.ChatEndpointDetail.publicationCancelled"),
        tone: "success",
      });
    },
    onError: (error) =>
      pushToast({
        title: t("ui3g6.ChatEndpointDetail.couldnTResolveActivity"),
        body: error instanceof Error ? error.message : t("ui3g6.ChatEndpointDetail.tryAgain2"),
        tone: "error",
      }),
  });
  const lifecycle = useMutation({
    mutationFn: async (action: "pause" | "resume" | "remove") =>
      endpoint.provider === "agentmail"
        ? emailApi.control(endpointId, action)
        : chatEndpointsApi.setup(endpointId, { action }),
    onSuccess: async (next, action) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.chatEndpoints.list(next.companyId),
      });
      if (endpoint.provider === "agentmail") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["email-inboxes", next.companyId] }),
          queryClient.invalidateQueries({ queryKey: queryKeys.chatEndpoints.detail(endpointId) }),
        ]);
      }
      if (action === "remove") {
        navigate("/apps");
        return;
      }
      if (endpoint.provider !== "agentmail") queryClient.setQueryData(queryKeys.chatEndpoints.detail(endpointId), next);
      pushToast({
        title: action === "pause" ? t("ui3g6.ChatEndpointDetail.connectionPaused") : t("ui3g6.ChatEndpointDetail.connectionResumed"),
        tone: "success",
      });
    },
    onError: (error) =>
      pushToast({
        title: t("ui3g6.ChatEndpointDetail.couldnTUpdateConnection"),
        body: error instanceof Error ? error.message : t("ui3g6.ChatEndpointDetail.tryAgain2"),
        tone: "error",
      }),
  });
  const rows = query.data?.items ?? [];
  // Calls use their own caller-authorized API and appear once in recent activity.
  // Older connection-event pages retain the existing cursor contract.
  const activityEntries = [
    ...(!query.isError ? rows.map(item => ({ kind: "connection" as const, id: `connection:${item.id}`, createdAt: item.createdAt, item })) : []),
    ...(!cursor && !calls.error ? calls.entries.map(entry => ({ kind: "call" as const, id: `call:${entry.session.id}`, createdAt: entry.session.createdAt, entry })) : []),
    ...(!cursor && !calls.incomingError ? calls.unapprovedCalls.map(call => ({ kind: "unapproved_call" as const, id: `unapproved:${call.id}`, createdAt: call.createdAt, call })) : []),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));

  const { status } = endpoint;
  const health = connectionHealthPresentation(endpoint);
  const lifecycleAction = lifecycle.variables;
  const callbackSurfaceRows = endpoint.setup?.callbackSurfaces
    ? ([
        [t("ui3g6.ChatEndpointDetail.eventsApi"), endpoint.setup.callbackSurfaces.events],
        [t("ui3g6.ChatEndpointDetail.interactivity"), endpoint.setup.callbackSurfaces.interactivity],
        [t("ui3g6.ChatEndpointDetail.slashCommand"), endpoint.setup.callbackSurfaces.slashCommands],
      ] as const)
    : [];
  return (
    <section className="space-y-5" aria-label={t("ui3g6.ChatEndpointDetail.connectionActivity")}>
      <h2 className="text-lg font-semibold">{t("ui3g6.ChatEndpointDetail.connectionActivity")}</h2>
      {((status !== "active" && health.message) || health.error) && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${status === "attention" || status === "revoked" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-border bg-muted/30 text-foreground"}`}
        >
          {(status === "attention" || status === "revoked") && (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            {health.message && <p>{health.message}</p>}
            {health.previousHealth && (
              <p className="mt-1 text-xs opacity-80">
                <span className="font-medium">Last reported health:</span>{" "}
                {health.previousHealth}
              </p>
            )}
            {health.error && (
              <p className="mt-1 text-xs opacity-80">
                <span className="font-medium">{health.errorLabel}:</span>{" "}
                {health.error}
              </p>
            )}
          </div>
        </div>
      )}
      <details className="group rounded-lg border border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium chat-connection-health-summary">
          <span>{t("ui3g6.ChatEndpointDetail.connectionHealthAndControls")}</span>
          <span className="flex items-center gap-2">
            {endpoint.setup?.callbacksNeedUpdate && <span className="text-xs text-(--status-task-blocked)">{t("ui3g6.ChatEndpointDetail.callbackUrlsNeedAttention")}</span>}
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="space-y-5 border-t border-border p-4">
      {endpoint.provider === "slack" && callbackSurfaceRows.length > 0 && (
        <div
          className="space-y-3 text-sm"
        >
          <p className="font-medium">{t("ui3g6.ChatEndpointDetail.slackCallbackHealth")}</p>
          <p className="text-xs text-muted-foreground">
            {endpoint.setup?.callbacksNeedUpdate
              ? t("ui3g6.ChatEndpointDetail.slackCallbackUrlsNeedAn")
              : t("ui3g6.ChatEndpointDetail.paperclipRecordsEachCallbackSurface")}
          </p>
          <div className="divide-y divide-border border-y border-border">
            {callbackSurfaceRows.map(([label, surface]) => (
              <div key={label} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <p className="text-xs font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {surface.status === "current"
                    ? t("ui3g6.ChatEndpointDetail.current")
                    : surface.status === "stale"
                      ? t("ui3g6.ChatEndpointDetail.staleUrl")
                      : t("ui3g6.ChatEndpointDetail.notObserved")}
                </p>
                {surface.observedAt && (
                  <p className="text-xs text-muted-foreground">
                    Last observed{" "}
                    <time
                      dateTime={surface.observedAt}
                      title={surface.observedAt}
                      className="font-mono"
                    >
                      {formatDateTime(surface.observedAt, {
                        includeSeconds: true,
                      })}
                    </time>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {status !== "archived" && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            {status === "active" && (
              <Button
                variant="outline"
                disabled={lifecycle.isPending}
                onClick={() => lifecycle.mutate("pause")}
              >
                {lifecycle.isPending && lifecycleAction === "pause" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Pause />
                )}
                Pause
              </Button>
            )}
            {status === "paused" && (
              <Button
                variant="outline"
                disabled={lifecycle.isPending}
                onClick={() => lifecycle.mutate("resume")}
              >
                {lifecycle.isPending && lifecycleAction === "resume" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Play />
                )}
                Resume
              </Button>
            )}
            {[
              "active",
              "paused",
              "attention",
              "revoked",
              "draft",
              "verifying",
            ].includes(status) && (
              <Button
                variant="outline"
                disabled={lifecycle.isPending}
                onClick={() =>
                  navigate(
                    endpoint.provider === "agentmail" && status !== "draft" && status !== "verifying"
                      ? `/apps/chat/${endpoint.id}/settings`
                      : `/apps/chat/connect?provider=${endpoint.provider}&purpose=chat&resume=${endpoint.id}${status === "draft" || status === "verifying" ? "" : "&reconnect=1"}`,
                  )
                }
              >
                <RefreshCw />
                {status === "draft" || status === "verifying"
                  ? t("ui3g6.ChatEndpointDetail.finishSetup")
                  : t("ui3g6.ChatEndpointDetail.reconnect")}
              </Button>
            )}
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={lifecycle.isPending}
              onClick={() => setRemoveOpen(true)}
            >
              <Trash2 />
              {t("ui3g6.ChatEndpointDetail.removeConnection")}
            </Button>
          </div>
          {status !== "draft" && status !== "verifying" && (
            <p className="text-xs text-muted-foreground">
              {providerLifecycleGuidance[endpoint.provider].reconnect}
            </p>
          )}
        </div>
      )}
        </div>
      </details>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{t("ui3g6.ChatEndpointDetail.recentActivity")}</h3>
          {endpoint.provider === "speko" && !cursor && <Button size="sm" variant="ghost" onClick={() => { void query.refetch(); calls.onRetry(); }} disabled={query.isFetching || calls.loading}>{t("ui3g6.ChatEndpointDetail.refresh")}</Button>}
        </div>
        {endpoint.provider === "agentmail" && rows.some((item) => item.kind === "publication" && item.status === "delivery_unknown") && (
          <p className="text-sm text-muted-foreground">
            Review unconfirmed email delivery in the{" "}
            <Link to={`/apps/chat/${endpointId}/conversations`} className="underline underline-offset-4">{t("ui3g6.ChatEndpointDetail.conversationsTask")}</Link>.
          </p>
        )}
        <div className="divide-y divide-border border-y border-border">
          {(query.isLoading || calls.loading) && (
            <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("ui3g6.ChatEndpointDetail.loadingActivity")}
            </div>
          )}
          {query.isError && (
            <div className="flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="text-sm text-destructive" role="alert">
                {t("ui3g6.ChatEndpointDetail.connectionActivityCouldNotBe")}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => query.refetch()}
              >
                {t("ui3g6.ChatEndpointDetail.tryAgain")}
              </Button>
            </div>
          )}
          {endpoint.provider === "speko" && !cursor && [
            calls.error && t("ui3g6.ChatEndpointDetail.callActivityError", { error: calls.error }),
            calls.incomingError && t("ui3g6.ChatEndpointDetail.unapprovedCallsError", { error: calls.incomingError }),
            calls.endError && t("ui3g6.ChatEndpointDetail.callEndError", { error: calls.endError }),
          ].filter(Boolean).map((message) => <div key={String(message)} className="flex flex-wrap items-center justify-between gap-3 py-4"><p role="alert" className="text-sm text-destructive">{message}</p><Button size="sm" variant="outline" onClick={calls.onRetry}>{t("ui3g6.ChatEndpointDetail.retryCalls")}</Button></div>)}
          {activityEntries.map(entry => {
            if (entry.kind === "call") return <SpekoCallActivityItem key={entry.id} entry={entry.entry} presentation="activity" onEnd={calls.onEnd} ending={calls.endingSessionId === entry.entry.session.id} />;
            if (entry.kind === "unapproved_call") return <SpekoUnapprovedCallActivityItem key={entry.id} call={entry.call} presentation="activity" />;
            const item = entry.item;
            return (
              <div
                key={entry.id}
                data-activity-kind="connection"
                className="flex items-start gap-3 px-2 py-3 transition-colors hover:bg-accent/50"
              >
                <span className="mt-0.5 text-muted-foreground" aria-hidden="true">
                  {item.kind === "delivery" ? <ArrowDownLeft className="size-4" /> : item.kind === "publication" ? <ArrowUpRight className="size-4" /> : <ActivityIcon className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="min-w-0 flex-1 text-sm font-medium">{item.summary}</p>
                    <StatusBadge status={item.status} />
                    <time dateTime={item.createdAt} title={item.createdAt} className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(item.createdAt, { includeSeconds: true })}
                    </time>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{activityKindLabels[item.kind]}</p>
                  {item.fileTransfer && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.fileTransfer.filename} —{" "}
                      {item.fileTransfer.phase.replaceAll("_", " ")}
                    </p>
                  )}
                  {item.detail && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {activityDetailLabel(item)}:
                      </span>{" "}
                      {item.detail}
                    </p>
                  )}
                </div>
                {endpoint.provider !== "agentmail" && isReplayEligible(item) && (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={t("ui3g6.ChatEndpointDetail.replayFailed", { kind: item.kind })}
                    disabled={replay.isPending}
                    onClick={() => replay.mutate(item)}
                  >
                    {replay.isPending && replay.variables?.id === item.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RefreshCw />
                    )}
                    Replay
                  </Button>
                )}
                {endpoint.provider !== "agentmail" && isResolutionEligible(item) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setResolutionItem(item)}
                  >
                    {t("ui3g6.ChatEndpointDetail.resolve")}
                  </Button>
                )}
              </div>
            );
          })}
          {!query.isLoading && !query.isError && !calls.loading && !calls.error && !calls.incomingError && activityEntries.length === 0 && (
            <p className="py-5 text-sm text-muted-foreground">
              {t("ui3g6.ChatEndpointDetail.noConnectionActivityYet")}
            </p>
          )}
        </div>
      </div>
      <nav aria-label={t("ui3g6.ChatEndpointDetail.activityPagination")} className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Page {cursors.length}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={cursors.length === 1 || query.isFetching} onClick={() => setCursors((pages) => pages.slice(0, -1))}>{t("ui3g6.ChatEndpointDetail.previous")}</Button>
          <Button size="sm" variant="outline" disabled={!query.data?.nextCursor || query.isFetching || query.isError} onClick={() => { if (query.data?.nextCursor) setCursors((pages) => [...pages, query.data.nextCursor!]); }}>{t("ui3g6.ChatEndpointDetail.next")}</Button>
        </div>
      </nav>
      <AlertDialog
        open={resolutionItem !== null}
        onOpenChange={(open) => !open && setResolutionItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {resolutionItem?.actionType === "slash_task_start"
                ? t("ui3g6.ChatEndpointDetail.resolveUnconfirmedTaskStart")
                : resolutionItem?.actionType === "provider_effect"
                  ? t("ui3g6.ChatEndpointDetail.resolveUnconfirmedProviderReply")
                  : t("ui3g6.ChatEndpointDetail.resolveUnconfirmedDelivery")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resolutionItem?.actionType === "slash_task_start"
                ? t("ui3g6.ChatEndpointDetail.paperclipLostConfirmationAfterAsking")
                : resolutionItem?.actionType === "provider_effect"
                  ? t("ui3g6.ChatEndpointDetail.lostConfirmReply")
                  : resolutionItem
                    ? activityResolutionDescription(resolutionItem)
                    : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-wrap">
            <AlertDialogCancel disabled={resolveActivity.isPending}>
              {t("ui3g6.ChatEndpointDetail.keepUnresolved")}
            </AlertDialogCancel>
            {resolutionItem &&
              activityResolutionActions(resolutionItem).includes("cancel") && (
                <Button
                  variant="outline"
                  disabled={resolveActivity.isPending}
                  onClick={() =>
                    resolutionItem &&
                    resolveActivity.mutate({
                      item: resolutionItem,
                      action: "cancel",
                    })
                  }
                >
                  {resolutionItem.actionType === "slash_task_start"
                    ? t("ui3g6.ChatEndpointDetail.cancelTaskStart")
                    : resolutionItem.actionType === "provider_effect"
                      ? t("ui3g6.ChatEndpointDetail.cancelProviderReply")
                      : resolutionItem.fileTransfer
                        ? t("ui3g6.ChatEndpointDetail.cancelFileTransfer")
                        : t("ui3g6.ChatEndpointDetail.cancelPublication")}
                </Button>
              )}
            {resolutionItem &&
              activityResolutionActions(resolutionItem).includes(
                "retry_anyway",
              ) && (
                <Button
                  variant="outline"
                  disabled={resolveActivity.isPending}
                  onClick={() =>
                    resolutionItem &&
                    resolveActivity.mutate({
                      item: resolutionItem,
                      action: "retry_anyway",
                    })
                  }
                >
                  {resolutionItem.fileTransfer
                    ? t("ui3g6.ChatEndpointDetail.retryFileNotification")
                    : t("ui3g6.ChatEndpointDetail.retryAnyway")}
                </Button>
              )}
            {resolutionItem &&
              activityResolutionActions(resolutionItem).includes(
                "mark_delivered",
              ) && (
                <AlertDialogAction
                  disabled={resolveActivity.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    if (resolutionItem) {
                      resolveActivity.mutate({
                        item: resolutionItem,
                        action: "mark_delivered",
                      });
                    }
                  }}
                >
                  {t("ui3g6.ChatEndpointDetail.markDelivered")}
                </AlertDialogAction>
              )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ui3g6.ChatEndpointDetail.removeThisConnection")}</AlertDialogTitle>
            <AlertDialogDescription>
              {endpoint.assignedAgentName} will stop receiving new work from
              {` ${providerNames[endpoint.provider]}`}. Existing Paperclip tasks
              remain available.{" "}
              {providerLifecycleGuidance[endpoint.provider].remove}
              {endpoint.provider === "slack" && (
                <> <a
                  href={endpoint.setup?.slackRegistration?.managementUrl ?? "https://api.slack.com/apps"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >{t("ui3g6.ChatEndpointDetail.openSlackSettings")}</a> {t("ui3g6.ChatEndpointDetail.manageSlackApp")}</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("ui3g6.ChatEndpointDetail.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={lifecycle.isPending}
              onClick={() => lifecycle.mutate("remove")}
            >
              {lifecycle.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {t("ui3g6.ChatEndpointDetail.removeConnection")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
