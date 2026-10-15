import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectPopover } from "../../components/ui/select";
import { AdapterMark } from "../../components/AdapterMark";
import { GrokBotConnection } from "../../components/GrokBotConnection";
import { DotRunnerConnection } from "../../components/DotRunnerConnection";
import { configFieldsForSection } from "../config-sections";
import type { AdapterConfigFieldsProps } from "../types";
import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { buildCodexLocalConfig } from "@paperclipai/adapter-codex-local/ui";
import {
  Field,
  ToggleField,
  DraftInput,
  DraftNumberInput,
  help,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";
import { LocalWorkspaceRuntimeFields } from "../local-workspace-runtime-fields";
import {
  DEFAULT_CODEX_LOCAL_MODEL,
  CODEX_LOCAL_FAST_MODE_SUPPORTED_MODELS,
  isCodexLocalFastModeSupported,
  isCodexLocalManualModel,
  resolveCodexLocalCliPolicy,
} from "@paperclipai/adapter-codex-local";
import {
  PAPERCLIP_RUNNER_IDLE_TIMEOUT_DEFAULT_MS,
  PAPERCLIP_RUNNER_IDLE_TIMEOUT_MAX_MS,
  PAPERCLIP_RUNNER_PERMISSION_CAPABILITIES,
  PAPERCLIP_RUNNER_ACPX_PROFILES,
  isPaperclipRunnerProvider,
  resolvePaperclipRunnerIdleTimeoutMs,
  resolvePaperclipRunnerPermissionMode,
  type PaperclipRunnerPermissionMode,
  type PaperclipRunnerPermissionCapability,
} from "@paperclipai/adapter-utils";
import { useTranslation } from "@/i18n";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const defaultOpenCodeRunnerModel = "openrouter/deepseek/deepseek-v4-flash-0731";
const defaultAcpxClaudeModel = "claude-sonnet-5";
const defaultClaudeManagedModel = "claude-sonnet-5";
const defaultAwsAgentCoreModel = "global.anthropic.claude-sonnet-4-6";
const runnerHarnessOptions = [
  { value: "codex", label: "Codex", adapter: "codex_local" },
  { value: "opencode", label: "OpenCode 1.18.34", adapter: "opencode_local" },
  { value: "claude_managed", label: "Claude Managed", adapter: "claude_local" },
  { value: "aws_agentcore", label: "AWS AgentCore", adapter: "aws_agentcore" },
  { value: "acpx", labelKey: "ui3g0.adapters.codex.harnessAcpAgents", adapter: "acpx_local" },
  { value: "grok", label: "Grok Build", adapter: "grok_local" },
];

export function buildCodexRunnerConfig(values: CreateConfigValues): Record<string, unknown> {
  const config = buildCodexLocalConfig(values);
  if (values.codexLegacySandboxBypass !== undefined) {
    config.dangerouslyBypassApprovalsAndSandbox = values.codexLegacySandboxBypass;
  } else if (values.runner !== "legacy") {
    delete config.dangerouslyBypassApprovalsAndSandbox;
  }
  return {
    ...config,
    ...(values.codexPermissionMode !== undefined ? { codexPermissionMode: values.codexPermissionMode } : {}),
    ...(values.paperclipRunnerLifecycleMode !== undefined ? { lifecycleMode: values.paperclipRunnerLifecycleMode } : {}),
    ...(values.paperclipRunnerIdleTimeoutMs !== undefined ? { idleTimeoutMs: values.paperclipRunnerIdleTimeoutMs } : {}),
  };
}

export function CodexLocalConfigFields({
  section,
  companyId,
  agentId,
  mode,
  isCreate,
  adapterType,
  values,
  set,
  config,
  eff,
  mark,
  models,
  hideInstructionsFile,
  managedSandboxOnly,
  hideRunnerHarness,
}: AdapterConfigFieldsProps) {
  const { t } = useTranslation();
  const instructionsFileHint = t("ui3g0.adapters.codex.instructionsFileHint");
  const runnerManaged = adapterType === "paperclip_runner";
  // The execution engine picks which binary runs on the execution host, and the
  // ACP sub-fields below name host paths. The platform-managed environment owns
  // both, so the managed-sandbox-only policy hides them the same way
  // `runnerManaged` already does for the Paperclip Runner.
  const hideEngineChoice = runnerManaged || managedSandboxOnly === true;
  const configuredRunnerProvider = runnerManaged
    ? isCreate
      ? values!.adapterSchemaValues?.provider
      : eff("adapterConfig", "provider", config.provider === "acpx" && config.acpxAgent === "codex" ? "codex" : config.provider ?? "codex")
    : "codex";
  const runnerProvider = String(configuredRunnerProvider ?? "codex");
  const runnerPermissionCapability: PaperclipRunnerPermissionCapability =
    isPaperclipRunnerProvider(runnerProvider)
      ? PAPERCLIP_RUNNER_PERMISSION_CAPABILITIES[runnerProvider]
      : { configurable: false, defaultMode: "provider-managed", options: [], description: t("ui3g0.adapters.codex.unknownProviderConfig") };
  const configuredRunnerPermissionMode =
    runnerManaged && runnerPermissionCapability.configurable
      ? isCreate
        ? (values!.adapterSchemaValues?.[
            runnerPermissionCapability.configKey
          ] ??
          (runnerProvider === "codex"
            ? values!.codexPermissionMode
            : undefined))
        : eff(
            "adapterConfig",
            runnerPermissionCapability.configKey,
            config[runnerPermissionCapability.configKey],
          )
      : undefined;
  const runnerPermissionModeUnsupported =
    runnerManaged &&
    runnerPermissionCapability.configurable &&
    configuredRunnerPermissionMode !== undefined &&
    !runnerPermissionCapability.options.some(
      (option) => option.value === configuredRunnerPermissionMode,
    );
  const runnerPermissionMode =
    runnerManaged && runnerPermissionCapability.configurable
      ? resolvePaperclipRunnerPermissionMode(
          isPaperclipRunnerProvider(runnerProvider) ? runnerProvider : "codex",
          configuredRunnerPermissionMode,
        )
      : runnerPermissionCapability.defaultMode;
  const runnerSchemaValue = (key: string, fallback: unknown): unknown =>
    isCreate
      ? (values!.adapterSchemaValues?.[key] ?? fallback)
      : eff("adapterConfig", key, config[key] ?? fallback);
  const updateRunnerSchemaValue = (key: string, value: unknown): void => {
    if (isCreate) {
      set!({
        adapterSchemaValues: {
          ...values!.adapterSchemaValues,
          [key]: value,
        },
      });
    } else {
      mark("adapterConfig", key, value);
    }
  };
  const runnerLifecycleMode = runnerManaged
    ? isCreate
      ? (values!.paperclipRunnerLifecycleMode ?? "per_turn")
      : eff(
          "adapterConfig",
          "lifecycleMode",
          config.lifecycleMode === "warm" ? "warm" : "per_turn",
        )
    : "per_turn";
  const runnerIdleTimeoutMs = runnerManaged
    ? resolvePaperclipRunnerIdleTimeoutMs(
        isCreate
          ? values!.paperclipRunnerIdleTimeoutMs
          : eff("adapterConfig", "idleTimeoutMs", config.idleTimeoutMs),
      )
    : PAPERCLIP_RUNNER_IDLE_TIMEOUT_DEFAULT_MS;
  const rawEngine = runnerManaged
    ? "cli"
    : isCreate
      ? (values!.codexEngine ?? "auto")
      : eff("adapterConfig", "engine", String(config.engine ?? "auto"));
  const engine =
    rawEngine === "acp" || rawEngine === "cli" ? rawEngine : "auto";
  const acpSelected = engine === "acp";
  const bypassEnabled = resolveCodexLocalCliPolicy({
    ...config,
    dangerouslyBypassApprovalsAndSandbox: eff("adapterConfig", "dangerouslyBypassApprovalsAndSandbox", config.dangerouslyBypassApprovalsAndSandbox),
    dangerouslyBypassSandbox: eff("adapterConfig", "dangerouslyBypassSandbox", config.dangerouslyBypassSandbox),
    extraArgs: eff("adapterConfig", "extraArgs", config.extraArgs),
    args: eff("adapterConfig", "args", config.args),
  }).bypass;
  const fastModeEnabled = isCreate
    ? Boolean(values!.fastMode)
    : eff("adapterConfig", "fastMode", Boolean(config.fastMode));
  const currentModel = isCreate
    ? String(values!.model ?? "")
    : eff("adapterConfig", "model", String(config.model ?? ""));
  const fastModeManualModel = isCodexLocalManualModel(currentModel);
  const fastModeSupported = isCodexLocalFastModeSupported(currentModel);
  const supportedModelsLabel =
    CODEX_LOCAL_FAST_MODE_SUPPORTED_MODELS.join(", ");
  const fastModeMessage = fastModeManualModel
    ? t("ui3g0.adapters.codex.fastModeManualModel")
    : fastModeSupported
      ? t("ui3g0.adapters.codex.fastModeConsumesMore")
      : t("ui3g0.adapters.codex.fastModeUnsupported", { models: supportedModelsLabel });

  return configFieldsForSection(section, (
    <>
      {!hideEngineChoice && (
        <Field
          label={t("ui3g0.adapters.codex.executionEngine")}
          hint={t("ui3g0.adapters.codex.executionEngineHint")}
        >
          <SelectPopover
            aria-label={t("ui3g0.adapters.codex.executionEngine")}
            value={engine}
            onValueChange={(next) => {
              const value =
                next === "acp"
                  ? "acp"
                  : next === "cli"
                    ? "cli"
                    : "auto";
              isCreate
                ? set!({ codexEngine: value })
                : mark(
                    "adapterConfig",
                    "engine",
                    value === "auto" ? undefined : value,
                  );
            }}
            options={[
              { value: "auto", label: t("ui3g0.adapters.codex.engineDefault") },
              { value: "cli", label: "Codex CLI" },
              { value: "acp", label: "ACP" },
            ]}
          />
        </Field>
      )}
      {runnerManaged && !hideRunnerHarness && runnerProvider !== "openai_dot" && runnerProvider !== "grok_bot" && (
        <Field configSection="adapter"
          label={t("ui3g0.adapters.codex.harness")}
          hint={t("ui3g0.adapters.codex.harnessHint")}
        >
          <Select
            value={runnerProvider === "acpx" && runnerSchemaValue("acpxAgent", "claude") === "grok" ? "grok" : runnerProvider}
            onValueChange={(value) => {
              const grok = value === "grok";
              const provider = grok ? "acpx" : isPaperclipRunnerProvider(value)
                ? value
                : "codex";
              const model =
                provider === "openai_dot"
                  ? ""
                  : provider === "opencode"
                  ? defaultOpenCodeRunnerModel
                  : provider === "claude_managed"
                    ? defaultClaudeManagedModel
                    : provider === "aws_agentcore"
                      ? defaultAwsAgentCoreModel
                      : provider === "acpx"
                        ? grok ? "grok-4.7" : defaultAcpxClaudeModel
                        : DEFAULT_CODEX_LOCAL_MODEL;
              if (isCreate) {
                set!({
                  model,
                  adapterSchemaValues: {
                    ...values!.adapterSchemaValues,
                    provider,
                    acpxSessionMode: undefined,
                    piThinkingLevel: undefined,
                    ...(provider === "acpx" ? { acpxAgent: grok ? "grok" : "claude" } : {}),
                  },
                });
              } else {
                mark("adapterConfig", "provider", provider);
                mark("adapterConfig", "acpxSessionMode", undefined);
                mark("adapterConfig", "piThinkingLevel", undefined);
                mark("adapterConfig", "model", model);
                if (provider === "openai_dot") {
                  mark("adapterConfig", "lifecycleMode", "per_turn");
                  for (const key of ["cwd", "env", "instructionsFilePath", "command", "extraArgs", "engine", "modelReasoningEffort", "workspaceStrategy", "workspaceRuntime", "idleTimeoutMs", "acpxAgent", "managedProfileId", "agentCoreProfileId"]) mark("adapterConfig", key, undefined);
                }
                if (provider === "acpx") {
                  mark("adapterConfig", "acpxAgent", grok ? "grok" : "claude");
                }
              }
            }}
          >
            <SelectTrigger className="w-full" aria-label={t("ui3g0.adapters.codex.harness")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {!isPaperclipRunnerProvider(runnerProvider) && <SelectItem value={runnerProvider} disabled>{t("ui3g0.adapters.codex.unknownProvider", { provider: runnerProvider })}</SelectItem>}
              {runnerHarnessOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <AdapterMark type={option.adapter} className="size-4" />
                  {option.labelKey ? t(option.labelKey) : option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {runnerManaged && runnerProvider === "grok_bot" && <GrokBotConnection companyId={companyId} agentId={agentId} />}
      {runnerManaged && runnerProvider === "openai_dot" && <>
        <Field configSection="adapter" label={t("ui3g0.adapters.codex.dotConnection")} hint={t("ui3g0.adapters.codex.dotConnectionHint")}>
          <DotRunnerConnection companyId={companyId} agentId={agentId} bindingId={String(runnerSchemaValue("dotBindingId", ""))} onBinding={id => updateRunnerSchemaValue("dotBindingId", id)} />
        </Field>
        <ToggleField label={t("ui3g0.adapters.codex.dotReadAttachments")} hint={t("ui3g0.adapters.codex.dotReadAttachmentsHint")}
          checked={runnerSchemaValue("dotAttachmentAccess", false) === true} onChange={value => updateRunnerSchemaValue("dotAttachmentAccess", value)} />
        <ToggleField label={t("ui3g0.adapters.codex.dotWorkspaceAccess")} hint={t("ui3g0.adapters.codex.dotWorkspaceAccessHint")}
          checked={runnerSchemaValue("dotWorkspaceAccess", false) === true} onChange={value => updateRunnerSchemaValue("dotWorkspaceAccess", value)} />
        <ToggleField label={t("ui3g0.adapters.codex.allowUnmetered")} hint={t("ui3g0.adapters.codex.allowUnmeteredHint")}
          checked={runnerSchemaValue("allowUnmeteredProvider", false) === true} onChange={value => updateRunnerSchemaValue("allowUnmeteredProvider", value)} />
      </>}
      {runnerManaged && runnerProvider === "acpx" && runnerSchemaValue("acpxAgent", "claude") !== "grok" && (
        <Field configSection="adapter" label={t("ui3g0.adapters.codex.acpAgent")} hint={t("ui3g0.adapters.codex.acpAgentHint")}>
          <Select
            value={String(isCreate ? values!.adapterSchemaValues?.acpxAgent ?? "claude" : eff("adapterConfig", "acpxAgent", config.acpxAgent ?? "claude"))}
            onValueChange={(value) => {
              const profile = PAPERCLIP_RUNNER_ACPX_PROFILES.find(entry => entry.value === value);
              const acpxSessionMode = profile?.value === "cursor" ? "agent" : undefined;
              const piThinkingLevel = profile?.value === "pi" ? "low" : undefined;
              if (!profile?.qualified) return;
              if (isCreate) set!({ model: profile.value === "claude" ? defaultAcpxClaudeModel : "",
                adapterSchemaValues: { ...values!.adapterSchemaValues, acpxAgent: profile.value, acpxSessionMode, piThinkingLevel } });
              else { mark("adapterConfig", "acpxAgent", profile.value); mark("adapterConfig", "acpxSessionMode", acpxSessionMode); mark("adapterConfig", "piThinkingLevel", piThinkingLevel); mark("adapterConfig", "model", profile.value === "claude" ? defaultAcpxClaudeModel : ""); }
            }}>
            <SelectTrigger className="w-full" aria-label={t("ui3g0.adapters.codex.acpAgent")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAPERCLIP_RUNNER_ACPX_PROFILES.map(profile => (
                <SelectItem key={profile.value} value={profile.value} disabled={!profile.qualified}>
                  <AdapterMark type={profile.value === "cursor" ? "cursor" : `${profile.value}_local`} className="size-4" />
                  {profile.label}{profile.qualified ? "" : " — qualification pending"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {runnerManaged && runnerProvider === "acpx" && runnerSchemaValue("acpxAgent", "claude") === "cursor" && (
        <Field configSection="adapter" label={t("ui3g0.adapters.codex.cursorMode")} hint={t("ui3g0.adapters.codex.cursorModeHint")}>
          <select className={inputClass} aria-label={t("ui3g0.adapters.codex.cursorMode")}
            value={String(runnerSchemaValue("acpxSessionMode", "agent"))}
            onChange={(event) => updateRunnerSchemaValue("acpxSessionMode", event.target.value)}>
            {!["agent", "plan", "ask"].includes(String(runnerSchemaValue("acpxSessionMode", "agent"))) && (
              <option value={String(runnerSchemaValue("acpxSessionMode", "agent"))} disabled>{t("ui3g0.adapters.codex.unsupportedCursorMode")}</option>
            )}
            <option value="agent">Agent</option>
            <option value="plan">Plan</option>
            <option value="ask">Ask</option>
          </select>
        </Field>
      )}
      {runnerManaged && runnerProvider === "acpx" && runnerSchemaValue("acpxAgent", "claude") === "pi" && (
        <Field configSection="adapter" label={t("ui3g0.adapters.codex.piThinkingLevel")} hint={t("ui3g0.adapters.codex.piThinkingLevelHint")}>
          <select className={inputClass} aria-label={t("ui3g0.adapters.codex.piThinkingLevel")} value={String(runnerSchemaValue("piThinkingLevel", "low"))}
            onChange={(event) => updateRunnerSchemaValue("piThinkingLevel", event.target.value)}>
            {!["off", "low", "high", "max"].includes(String(runnerSchemaValue("piThinkingLevel", "low"))) && <option value={String(runnerSchemaValue("piThinkingLevel", "low"))} disabled>{t("ui3g0.adapters.codex.unsupportedThinkingLevel")}</option>}
            <option value="off">{t("ui3g0.adapters.codex.thinkingOff")}</option><option value="low">{t("ui3g0.adapters.codex.thinkingLow")}</option><option value="high">{t("ui3g0.adapters.codex.thinkingHigh")}</option><option value="max">{t("ui3g0.adapters.codex.thinkingMax")}</option>
          </select>
        </Field>
      )}
      {runnerManaged && runnerProvider === "claude_managed" && (
        <>
          <Field
            label={t("ui3g0.adapters.codex.managedProfile")}
            hint={t("ui3g0.adapters.codex.managedProfileHint")}
          >
            <DraftInput
              value={String(runnerSchemaValue("managedProfileId", ""))}
              onCommit={(value) =>
                updateRunnerSchemaValue("managedProfileId", value.trim())
              }
              immediate
              className={inputClass}
              placeholder="managed-primary"
            />
          </Field>
          <Field
            label={t("ui3g0.adapters.codex.sessionSpendCeiling")}
            hint={t("ui3g0.adapters.codex.sessionSpendCeilingHint")}
          >
            <DraftNumberInput
              value={Number(runnerSchemaValue("maxSessionListCostUsd", 1))}
              min={0.01}
              onCommit={(value) =>
                updateRunnerSchemaValue("maxSessionListCostUsd", value)
              }
              immediate
              className={inputClass}
            />
          </Field>
          <ToggleField
            label={t("ui3g0.adapters.codex.ackManagedRetention")}
            hint={t("ui3g0.adapters.codex.ackManagedRetentionHint")}
            checked={
              runnerSchemaValue("managedAgentsRetentionAcknowledged", false) ===
              true
            }
            onChange={(value) =>
              updateRunnerSchemaValue(
                "managedAgentsRetentionAcknowledged",
                value,
              )
            }
          />
        </>
      )}
      {runnerManaged && runnerProvider === "aws_agentcore" && (
        <>
          <Field
            label={t("ui3g0.adapters.codex.agentCoreProfile")}
            hint={t("ui3g0.adapters.codex.agentCoreProfileHint")}
          >
            <DraftInput
              value={String(runnerSchemaValue("agentCoreProfileId", ""))}
              onCommit={(value) =>
                updateRunnerSchemaValue("agentCoreProfileId", value.trim())
              }
              immediate
              className={inputClass}
              placeholder="agentcore-primary"
            />
          </Field>
          <Field
            label={t("ui3g0.adapters.codex.estimatedSessionCeiling")}
            hint={t("ui3g0.adapters.codex.estimatedSessionCeilingHint")}
          >
            <DraftNumberInput
              value={Number(runnerSchemaValue("maxEstimatedSessionCostUsd", 1))}
              min={0.01}
              onCommit={(value) =>
                updateRunnerSchemaValue("maxEstimatedSessionCostUsd", value)
              }
              immediate
              className={inputClass}
            />
          </Field>
          <Field
            label={t("ui3g0.adapters.codex.maxIterations")}
            hint={t("ui3g0.adapters.codex.maxIterationsHint")}
          >
            <DraftNumberInput
              value={Number(runnerSchemaValue("maxIterations", 8))}
              min={1}
              max={8}
              onCommit={(value) =>
                updateRunnerSchemaValue("maxIterations", value)
              }
              immediate
              className={inputClass}
            />
          </Field>
          <Field
            label={t("ui3g0.adapters.codex.maxOutputTokens")}
            hint={t("ui3g0.adapters.codex.maxOutputTokensHint")}
          >
            <DraftNumberInput
              value={Number(runnerSchemaValue("maxOutputTokens", 4_096))}
              min={1}
              max={4_096}
              onCommit={(value) =>
                updateRunnerSchemaValue("maxOutputTokens", value)
              }
              immediate
              className={inputClass}
            />
          </Field>
          <Field configSection="runPolicy"
            label={t("ui3g0.adapters.codex.invocationTimeout")}
            hint={t("ui3g0.adapters.codex.invocationTimeoutHint")}
          >
            <DraftNumberInput
              value={Number(runnerSchemaValue("timeoutSeconds", 300))}
              min={1}
              max={300}
              onCommit={(value) =>
                updateRunnerSchemaValue("timeoutSeconds", value)
              }
              immediate
              className={inputClass}
            />
          </Field>
          <ToggleField
            label={t("ui3g0.adapters.codex.ackMemoryRetention")}
            hint={t("ui3g0.adapters.codex.ackMemoryRetentionHint")}
            checked={
              runnerSchemaValue("agentCoreRetentionAcknowledged", false) ===
              true
            }
            onChange={(value) =>
              updateRunnerSchemaValue("agentCoreRetentionAcknowledged", value)
            }
          />
        </>
      )}
      {runnerManaged && runnerPermissionCapability.configurable && (runnerPermissionCapability.options.length > 1 || runnerPermissionModeUnsupported) && (
        <Field
          label={t("ui3g0.adapters.codex.permissionMode")}
          hint={t("ui3g0.adapters.codex.permissionModeHint", { description: runnerPermissionCapability.description })}
        >
          <Select
            value={
              runnerPermissionModeUnsupported
                ? "__unsupported__"
                : runnerPermissionMode
            }
            onValueChange={(selectedMode) => {
              const value = resolvePaperclipRunnerPermissionMode(
                isPaperclipRunnerProvider(runnerProvider) ? runnerProvider : "codex",
                selectedMode,
              ) as PaperclipRunnerPermissionMode;
              if (isCreate) {
                set!({
                  adapterSchemaValues: {
                    ...values!.adapterSchemaValues,
                    [runnerPermissionCapability.configKey]: value,
                  },
                });
              } else {
                mark(
                  "adapterConfig",
                  runnerPermissionCapability.configKey,
                  value,
                );
              }
            }}
          >
            <SelectTrigger aria-label={t("ui3g0.adapters.codex.permissionMode")} className="w-full font-sans">
              <SelectValue>
                {runnerPermissionModeUnsupported
                  ? t("ui3g0.adapters.codex.unsupportedPermissionMode")
                  : runnerPermissionCapability.options.find((option) => option.value === runnerPermissionMode)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {runnerPermissionModeUnsupported && (
                <SelectItem value="__unsupported__" disabled>
                  {t("ui3g0.adapters.codex.unsupportedPermissionMode")}
                </SelectItem>
              )}
              {runnerPermissionCapability.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {runnerPermissionModeUnsupported && runnerProvider === "codex" && (
            <p className="mt-1 text-xs text-destructive" role="alert">
              {t("ui3g0.adapters.codex.savedModeUnrecoverable")}
            </p>
          )}
        </Field>
      )}
      {runnerManaged && runnerProvider !== "openai_dot" && runnerProvider !== "grok_bot" && (
        <Field configSection="runPolicy"
          label={t("ui3g0.adapters.codex.runnerLifecycle")}
          hint={t("ui3g0.adapters.codex.runnerLifecycleHint")}
        >
          <SelectPopover
            aria-label={t("ui3g0.adapters.codex.runnerLifecycle")}
            value={runnerLifecycleMode}
            onValueChange={(next) => {
              const value = next === "warm" ? "warm" : "per_turn";
              isCreate
                ? set!({ paperclipRunnerLifecycleMode: value })
                : mark("adapterConfig", "lifecycleMode", value);
            }}
            options={[
              { value: "per_turn", label: t("ui3g0.adapters.codex.turnByTurn") },
              { value: "warm", label: t("ui3g0.adapters.codex.warmSession") },
            ]}
          />
        </Field>
      )}
      {runnerManaged && runnerProvider !== "openai_dot" && runnerProvider !== "grok_bot" && runnerLifecycleMode === "warm" && (
        <Field configSection="runPolicy"
          label={t("ui3g0.adapters.codex.warmIdleTimeout")}
          hint={t("ui3g0.adapters.codex.warmIdleTimeoutHint")}
        >
          {isCreate ? (
            <input
              type="number"
              min={1}
              max={PAPERCLIP_RUNNER_IDLE_TIMEOUT_MAX_MS}
              className={inputClass}
              value={runnerIdleTimeoutMs}
              onChange={(event) =>
                set!({
                  paperclipRunnerIdleTimeoutMs:
                    resolvePaperclipRunnerIdleTimeoutMs(
                      Number(event.target.value),
                    ),
                })
              }
            />
          ) : (
            <DraftNumberInput
              value={runnerIdleTimeoutMs}
              min={1}
              max={PAPERCLIP_RUNNER_IDLE_TIMEOUT_MAX_MS}
              onCommit={(value) =>
                mark(
                  "adapterConfig",
                  "idleTimeoutMs",
                  resolvePaperclipRunnerIdleTimeoutMs(value),
                )
              }
              immediate
              className={inputClass}
            />
          )}
        </Field>
      )}
      {acpSelected && (
        <>
          {!managedSandboxOnly && (
            <Field configSection="advanced"
              label={t("ui3g0.adapters.codex.acpServerCommand")}
              hint={t("ui3g0.adapters.codex.acpServerCommandHint")}
            >
              <DraftInput
                value={
                  isCreate
                    ? (values!.codexAcpAgentCommand ?? "")
                    : eff(
                        "adapterConfig",
                        "agentCommand",
                        String(config.agentCommand ?? ""),
                      )
                }
                onCommit={(v) =>
                  isCreate
                    ? set!({ codexAcpAgentCommand: v })
                    : mark("adapterConfig", "agentCommand", v || undefined)
                }
                immediate
                className={inputClass}
                placeholder="codex-acp"
              />
            </Field>
          )}
          <Field configSection="runPolicy"
            label={t("ui3g0.adapters.codex.acpSessionMode")}
            hint={t("ui3g0.adapters.codex.acpSessionModeHint")}
          >
            <SelectPopover
              aria-label={t("ui3g0.adapters.codex.acpSessionMode")}
              value={
                isCreate
                  ? (values!.codexAcpMode ?? "persistent")
                  : eff(
                      "adapterConfig",
                      "mode",
                      String(config.mode ?? "persistent"),
                    )
              }
              onValueChange={(next) => {
                const value =
                  next === "oneshot" ? "oneshot" : "persistent";
                isCreate
                  ? set!({ codexAcpMode: value })
                  : mark("adapterConfig", "mode", value);
              }}
              options={[
                { value: "persistent", label: t("ui3g0.adapters.codex.sessionModePersistent") },
                { value: "oneshot", label: t("ui3g0.adapters.codex.sessionModeOneShot") },
              ]}
            />
          </Field>
          <Field
            label={t("ui3g0.adapters.codex.acpPermissions")}
            hint={t("ui3g0.adapters.codex.acpPermissionsHint")}
          >
            <SelectPopover
              aria-label={t("ui3g0.adapters.codex.acpPermissions")}
              value={
                isCreate
                  ? (values!.codexAcpNonInteractivePermissions ?? "deny")
                  : eff(
                      "adapterConfig",
                      "nonInteractivePermissions",
                      String(config.nonInteractivePermissions ?? "deny"),
                    )
              }
              onValueChange={(next) => {
                const value = next === "fail" ? "fail" : "deny";
                isCreate
                  ? set!({ codexAcpNonInteractivePermissions: value })
                  : mark("adapterConfig", "nonInteractivePermissions", value);
              }}
              options={[
                { value: "deny", label: t("ui3g0.adapters.codex.permissionDeny") },
                { value: "fail", label: t("ui3g0.adapters.codex.permissionFail") },
              ]}
            />
          </Field>
          {!managedSandboxOnly && (
            <Field
              label={t("ui3g0.adapters.codex.acpStateDir")}
              hint={t("ui3g0.adapters.codex.acpStateDirHint")}
            >
              <div className="flex items-center gap-2">
                <DraftInput
                  value={
                    isCreate
                      ? (values!.codexAcpStateDir ?? "")
                      : eff(
                          "adapterConfig",
                          "stateDir",
                          String(config.stateDir ?? ""),
                        )
                  }
                  onCommit={(v) =>
                    isCreate
                      ? set!({ codexAcpStateDir: v })
                      : mark("adapterConfig", "stateDir", v || undefined)
                  }
                  immediate
                  className={inputClass}
                  placeholder="/path/to/acp-state"
                />
                <ChoosePathButton />
              </div>
            </Field>
          )}
          <Field configSection="runPolicy"
            label={t("ui3g0.adapters.codex.acpWarmIdle")}
            hint={t("ui3g0.adapters.codex.acpWarmIdleHint")}
          >
            {isCreate ? (
              <input
                type="number"
                className={inputClass}
                value={values!.codexAcpWarmHandleIdleMs ?? 0}
                onChange={(e) =>
                  set!({ codexAcpWarmHandleIdleMs: Number(e.target.value) })
                }
              />
            ) : (
              <DraftNumberInput
                value={eff(
                  "adapterConfig",
                  "warmHandleIdleMs",
                  Number(config.warmHandleIdleMs ?? 0),
                )}
                onCommit={(v) =>
                  mark("adapterConfig", "warmHandleIdleMs", v || 0)
                }
                immediate
                className={inputClass}
              />
            )}
          </Field>
        </>
      )}
      {!runnerManaged && !hideInstructionsFile && (
        <Field label={t("ui3g0.adapters.instructionsFileLabel")} hint={instructionsFileHint}>
          <div className="flex items-center gap-2">
            <DraftInput
              value={
                isCreate
                  ? (values!.instructionsFilePath ?? "")
                  : eff(
                      "adapterConfig",
                      "instructionsFilePath",
                      String(config.instructionsFilePath ?? ""),
                    )
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ instructionsFilePath: v })
                  : mark(
                      "adapterConfig",
                      "instructionsFilePath",
                      v || undefined,
                    )
              }
              immediate
              className={inputClass}
              placeholder="/absolute/path/to/AGENTS.md"
            />
            <ChoosePathButton />
          </div>
        </Field>
      )}
      {!runnerManaged && (
        <>
          <ToggleField
            label={t("ui3g0.adapters.codex.bypassSandbox")}
            hint={help.dangerouslyBypassSandbox}
            checked={
              isCreate
                ? resolveCodexLocalCliPolicy(buildCodexRunnerConfig(values!)).bypass
                : bypassEnabled
            }
            onChange={(v) =>
              isCreate
                ? set!({ dangerouslyBypassSandbox: v, codexLegacySandboxBypass: v })
                : mark(
                    "adapterConfig",
                    "dangerouslyBypassApprovalsAndSandbox",
                    v,
                  )
            }
          />
          <ToggleField
            label={t("ui3g0.adapters.codex.enableSearch")}
            hint={help.search}
            checked={
              isCreate
                ? values!.search
                : eff("adapterConfig", "search", !!config.search)
            }
            onChange={(v) =>
              isCreate
                ? set!({ search: v })
                : mark("adapterConfig", "search", v)
            }
          />
          <ToggleField
            label={t("ui3g0.adapters.codex.fastMode")}
            hint={help.fastMode}
            checked={fastModeEnabled}
            onChange={(v) =>
              isCreate
                ? set!({ fastMode: v })
                : mark("adapterConfig", "fastMode", v)
            }
          />
          {fastModeEnabled && (
            <div className="rounded-md border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              {fastModeMessage}
            </div>
          )}
        </>
      )}
      {runnerProvider !== "openai_dot" && runnerProvider !== "grok_bot" && <LocalWorkspaceRuntimeFields
        isCreate={isCreate}
        values={values}
        set={set}
        config={config}
        mark={mark}
        eff={eff}
        mode={mode}
        adapterType={adapterType}
        models={models}
      />}
    </>
  ));
}
