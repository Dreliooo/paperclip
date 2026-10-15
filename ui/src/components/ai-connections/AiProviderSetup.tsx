import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Network, Monitor } from "lucide-react";
import {
  aiProviderRoutingSchema,
  createAiConnectionSchema,
  type AiProvider,
  type AiProviderRouting,
  type AiConnectionBinding,
  type AiManagedConnectionSummary,
} from "@paperclipai/shared";
import { aiConnectionsApi } from "@/api/ai-connections";
import { agentsApi } from "@/api/agents";
import { ConnectionChoiceList } from "@/features/connections/ConnectionChoiceList";
import { ConnectionAccessDefaults, connectionDefaultSummarySentence } from "@/features/connections/ConnectionSetupFlow";
import { AppLogo } from "@/pages/apps/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AiConnectionCredentialStep } from "./AiConnectionCredentialStep";
import { useTranslation } from "@/i18n";

const providers = [
  {
    id: "openai",
    name: "OpenAI",
    descriptionKey: "ui3g1.AiProviderSetup.descOpenai",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    descriptionKey: "ui3g1.AiProviderSetup.descAnthropic",
  },
  { id: "google", name: "Google", descriptionKey: "ui3g1.AiProviderSetup.descGoogle" },
  { id: "xai", name: "xAI", descriptionKey: "ui3g1.AiProviderSetup.descXai" },
  {
    id: "openrouter",
    name: "OpenRouter",
    descriptionKey: "ui3g1.AiProviderSetup.descOpenrouter",
    advanced: true,
  },
  {
    id: "bedrock",
    name: "Amazon Bedrock",
    descriptionKey: "ui3g1.AiProviderSetup.descBedrock",
    advanced: true,
  },
  {
    id: "gateway",
    name: "Custom gateway",
    nameKey: "ui3g1.AiProviderSetup.customGateway",
    descriptionKey: "ui3g1.AiProviderSetup.descGateway",
    advanced: true,
  },
  {
    id: "local",
    name: "Local endpoint",
    nameKey: "ui3g1.AiProviderSetup.localEndpoint",
    descriptionKey: "ui3g1.AiProviderSetup.descLocal",
    advanced: true,
  },
] as const;
type ProviderChoice = (typeof providers)[number]["id"];

export function AiProviderSetup({
  companyId,
  agentId,
  environmentId,
  initialProvider,
  initialProtocol,
  providerLabel,
  advancedOnly = false,
  reconnect,
  onCancel,
  onComplete,
}: {
  companyId: string;
  agentId?: string;
  environmentId?: string;
  initialProvider?: ProviderChoice;
  initialProtocol?: AiProviderRouting["protocol"];
  providerLabel?: string;
  advancedOnly?: boolean;
  reconnect?: AiManagedConnectionSummary;
  onCancel: () => void;
  onComplete: (
    binding: Exclude<AiConnectionBinding, { mode: "responsible_user" }>,
  ) => void;
}) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<ProviderChoice | undefined>(
    reconnect
      ? reconnect.routing?.kind === "gateway" ||
        reconnect.routing?.kind === "local" ||
        reconnect.routing?.kind === "bedrock"
        ? reconnect.routing.kind
        : reconnect.provider
      : initialProvider,
  );
  const [step, setStep] = useState(
    reconnect || initialProvider ? "connect" : "provider",
  );
  const [ownershipChoice, setOwnership] = useState<"personal" | "shared">();
  const [allAgentsChoice, setAllAgents] = useState<boolean>();
  const [agentIds, setAgentIds] = useState(new Set(agentId ? [agentId] : []));
  const [protocol, setProtocol] = useState<AiProviderRouting["protocol"]>(
    reconnect?.routing?.protocol ?? initialProtocol ?? "responses",
  );
  const [auth, setAuth] = useState<AiProviderRouting["auth"]>(
    reconnect?.routing?.auth ?? "bearer",
  );
  const [baseUrl, setBaseUrl] = useState(reconnect?.routing?.baseUrl ?? "");
  const [region, setRegion] = useState(
    reconnect?.routing?.region ?? "us-east-1",
  );
  const [models, setModels] = useState(
    reconnect?.routing?.models.map((m) => m.id).join(", ") ?? "",
  );
  const [apiKey, setApiKey] = useState("");
  const client = useQueryClient();
  const accounts = useQuery({
    queryKey: ["ai-connections", companyId, agentId],
    queryFn: () => aiConnectionsApi.list(companyId, agentId),
  });
  const canManageConnections = accounts.data?.canManageConnections ?? false;
  const ownership = reconnect?.ownership ?? ownershipChoice ?? (!agentId && canManageConnections ? "shared" : "personal");
  const allAgents = allAgentsChoice ?? (!agentId && canManageConnections);
  const agents = useQuery({
    queryKey: ["agents", companyId, "provider-access"],
    queryFn: () => agentsApi.list(companyId),
  });
  const label = providerLabel ?? providers.find((p) => p.id === provider)?.name ?? "provider";
  const providerEntry = providers.find((p) => p.id === provider);
  const displayLabel = providerLabel ?? (providerEntry ? ("nameKey" in providerEntry ? t(providerEntry.nameKey) : providerEntry.name) : t("ui3g1.AiProviderSetup.providerFallback"));
  const advanced = reconnect ? Boolean(reconnect.routing) : ["openrouter", "bedrock", "gateway", "local"].includes(provider ?? "");
  const nativeProvider: AiProvider =
    provider === "bedrock"
      ? "anthropic"
      : provider === "gateway" || provider === "local"
        ? protocol === "messages"
          ? "anthropic"
          : "openai"
        : (provider ?? "openai");
  const name =
    reconnect?.name ??
    `${ownership === "personal" ? "My" : "Company"} ${
      provider === "gateway" && baseUrl
        ? (() => {
            try {
              return new URL(baseUrl).hostname;
            } catch {
              return label;
            }
          })()
        : label
    }`;
  const complete = (result: {
    connectionId: string;
    grantId: string;
    method?: "api_key" | "subscription";
  }) => {
    void client.invalidateQueries({ queryKey: ["ai-connections", companyId] });
    void client.invalidateQueries({ queryKey: ["tools"] });
    onComplete({
      provider: nativeProvider,
      method: result.method ?? "api_key",
      mode: ownership === "shared" ? "shared" : "delegated",
      ...result,
    });
  };
  const save = useMutation({
    mutationFn: () => {
      const routing =
        reconnect?.routing ??
        aiProviderRoutingSchema.parse({
          kind: provider,
          protocol: provider === "bedrock" ? "bedrock" : protocol,
          auth: provider === "openrouter" ? "bearer" : auth,
          ...(provider === "bedrock"
            ? { region }
            : provider === "gateway" || provider === "local"
              ? { baseUrl }
              : {}),
          models: models
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
            .map((id) => ({ id })),
        });
      return aiConnectionsApi.create(
        companyId,
        createAiConnectionSchema.parse({
          provider: nativeProvider,
          method: "api_key",
          name,
          ownership,
          allAgents,
          agentIds: [...agentIds],
          connectionId: reconnect?.id,
          routing,
          ...(auth !== "none" ? { apiKey } : {}),
        }),
      );
    },
    onSuccess: complete,
    onSettled: () => {
      setApiKey("");
    },
  });
  const choices = (advancedOnly: boolean) => (
    <ConnectionChoiceList
      choices={providers
        .filter((p) => Boolean("advanced" in p && p.advanced) === advancedOnly)
        .map((p) => ({
          ...p,
          name: "nameKey" in p ? t(p.nameKey) : p.name,
          description: t(p.descriptionKey),
          icon:
            p.id === "gateway" || p.id === "local" ? (
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                {p.id === "gateway" ? (
                  <Network className="size-5" />
                ) : (
                  <Monitor className="size-5" />
                )}
              </span>
            ) : (
              <AppLogo name={p.name} brandKey={p.id} />
            ),
        }))}
      onSelect={(id) => {
        setProvider(id as ProviderChoice);
        setStep("connect");
        setApiKey("");
        setAuth("bearer");
        save.reset();
      }}
    />
  );
  const modelSettings = (
    <label className="block space-y-2 text-xs text-muted-foreground">
      {t("ui3g1.AiProviderSetup.modelIds")}
      <Input
        aria-label={t("ui3g1.AiProviderSetup.modelIds")}
        value={models}
        onChange={(e) => setModels(e.target.value)}
        disabled={Boolean(reconnect)}
      />
      <span className="block">
        {t("ui3g1.AiProviderSetup.modelIdHint")}
      </span>
    </label>
  );
  const accessDefaults = !reconnect ? (
    <ConnectionAccessDefaults
      companyId={companyId}
      extra={advanced ? modelSettings : undefined}
      agents={agents.data ?? []}
      sentence={connectionDefaultSummarySentence({ grantKind: ownership === "shared" ? "organization" : "user", authKind: auth === "none" ? "none" : "api_key", installChoice: allAgents ? "all" : "specific", installCount: agentIds.size })}
      capabilities={{ canCreateOrganizationGrant: canManageConnections, canSetCompanyInstall: canManageConnections }}
      authKind={auth === "none" ? "none" : "api_key"}
      grantKind={ownership === "shared" ? "organization" : "user"}
      grantKinds={["user", "organization"]}
      setGrantKind={kind => setOwnership(kind === "organization" ? "shared" : "personal")}
      installChoice={allAgents ? "all" : "specific"}
      setInstallChoice={choice => setAllAgents(choice === "all")}
      installAgentIds={agentIds}
      setInstallAgentIds={setAgentIds}
      disabled={save.isPending}
      notice={!canManageConnections ? [t("ui3g1.AiProviderSetup.managerShareNotice")] : undefined}
    />
  ) : undefined;
  const cancel = () => reconnect || initialProvider ? onCancel() : setStep("provider");
  if (!reconnect && accounts.isPending) return <p role="status">{t("ui3g1.AiProviderSetup.loadingPermissions")}</p>;
  if (!reconnect && accounts.isError) return <p role="alert">{t("ui3g1.AiProviderSetup.permissionsLoadError")} <Button type="button" variant="ghost" onClick={() => void accounts.refetch()}>{t("ui3g1.AiProviderSetup.retry")}</Button></p>;
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6" onSubmit={(event) => event.stopPropagation()}>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">
          {step === "provider"
            ? t("ui3g1.AiProviderSetup.connectModelProvider")
            : reconnect ? t("ui3g1.AiProviderSetup.reconnectProvider", { name: displayLabel }) : t("ui3g1.AiProviderSetup.connectProvider", { name: displayLabel })}
        </h2>
      </div>
      {agents.isError && <p role="alert" className="text-sm text-destructive">{t("ui3g1.AiProviderSetup.agentsLoadError")} <Button type="button" variant="ghost" onClick={() => void agents.refetch()}>{t("ui3g1.AiProviderSetup.retry")}</Button></p>}
      {step === "provider" ? (
        <>
          {advancedOnly ? choices(true) : <>
          {choices(false)}
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              {t("ui3g1.AiProviderSetup.advancedProviders")}
            </summary>
            <div className="pt-4">{choices(true)}</div>
          </details>
          </>}
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("ui3g1.AiProviderSetup.cancel")}
          </Button>
        </>
      ) : !advanced ? (
        <AiConnectionCredentialStep
          companyId={companyId}
          provider={nativeProvider}
          connectionId={reconnect?.id}
          initialMethod={reconnect?.method}
          fixedMethod={Boolean(reconnect)}
          name={name}
          hideName
          ownership={ownership}
          allAgents={allAgents}
          agentIds={[...agentIds]}
          environmentId={environmentId}
          onCancel={cancel}
          defaults={accessDefaults}
          disabled={!reconnect && ownership === "shared" && !allAgents && agentIds.size === 0}
          onComplete={complete}
        />
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {(provider === "gateway" || provider === "local") && (
            <>
              <label className="block space-y-2 text-xs text-muted-foreground">
                {t("ui3g1.AiProviderSetup.providerUrl")}
                <Input
                  aria-label={t("ui3g1.AiProviderSetup.providerUrl")}
                  placeholder={
                    provider === "local"
                      ? "http://localhost:11434/v1"
                      : "https://gateway.example.com/v1"
                  }
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={Boolean(reconnect)}
                />
              </label>
              <label className="block space-y-2 text-xs text-muted-foreground">
                {t("ui3g1.AiProviderSetup.apiFormat")}
                <Select
                  value={protocol}
                  onValueChange={(v) => {
                    setProtocol(v as typeof protocol);
                    if (v !== "messages" && auth === "api_key")
                      setAuth("bearer");
                  }}
                  disabled={Boolean(reconnect) || Boolean(initialProtocol)}
                >
                  <SelectTrigger aria-label={t("ui3g1.AiProviderSetup.apiFormat")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="responses">
                      OpenAI Responses · Codex
                    </SelectItem>
                    <SelectItem value="messages">
                      Anthropic Messages · Claude
                    </SelectItem>
                    <SelectItem value="chat">
                      Chat Completions · OpenCode, Hermes
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </>
          )}
          {provider === "bedrock" && (
            <label className="block space-y-2 text-xs text-muted-foreground">
              {t("ui3g1.AiProviderSetup.awsRegion")}
              <Input
                aria-label={t("ui3g1.AiProviderSetup.awsRegion")}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={Boolean(reconnect)}
              />
            </label>
          )}
          {provider !== "openrouter" && (
            <label className="block space-y-2 text-xs text-muted-foreground">
              {t("ui3g1.AiProviderSetup.authentication")}
              <Select
                value={auth}
                onValueChange={(v) => setAuth(v as typeof auth)}
                disabled={Boolean(reconnect)}
              >
                <SelectTrigger aria-label={t("ui3g1.AiProviderSetup.authentication")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bearer">
                    {provider === "bedrock"
                      ? "Bedrock API key"
                      : "Bearer token"}
                  </SelectItem>
                  {provider !== "bedrock" && (
                    <>
                      {protocol === "messages" && (
                        <SelectItem value="api_key">
                          API key · x-api-key
                        </SelectItem>
                      )}
                      <SelectItem value="none">{t("ui3g1.AiProviderSetup.noAuthentication")}</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </label>
          )}
          {
            auth !== "none" && (
              <label className="block space-y-2 text-xs text-muted-foreground">
                {t("ui3g1.AiProviderSetup.apiKey")}
                <Input
                  aria-label={t("ui3g1.AiProviderSetup.apiKey")}
                  type="password"
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </label>
            )
          }
          {reconnect && <details><summary className="cursor-pointer text-sm text-muted-foreground">{t("ui3g1.AiProviderSetup.modelSettings")}</summary>{modelSettings}</details>}
          <p className="text-xs text-muted-foreground">
            {t("ui3g1.AiProviderSetup.testConnectionHint")}
          </p>
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error instanceof Error && save.error.name === "ZodError"
                ? t("ui3g1.AiProviderSetup.zodError")
                : save.error.message}
            </p>
          )}
          {accessDefaults}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={cancel}
              disabled={save.isPending}
            >
              {t("ui3g1.AiProviderSetup.back")}
            </Button>
            <Button
              type="submit"
              disabled={
                save.isPending || accounts.isPending || accounts.isError ||
                (!reconnect && ownership === "shared" && !allAgents && agentIds.size === 0) ||
                (auth !== "none" && !apiKey.trim())
              }
            >
              {save.isPending
                ? t("ui3g1.AiProviderSetup.connectingLabel")
                : reconnect
                  ? t("ui3g1.AiProviderSetup.reconnectLabel")
                  : t("ui3g1.AiProviderSetup.connectLabel")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
