import { useState, useRef, useEffect, useCallback } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { AGENT_ROLE_LABELS } from "@paperclipai/shared";
import { t, useTranslation } from "@/i18n";

/* ---- Help text for (?) tooltips ---- */
export const help = {
  get name() { return t("agentConfig.help.name"); },
  get title() { return t("agentConfig.help.title"); },
  get role() { return t("agentConfig.help.role"); },
  get reportsTo() { return t("agentConfig.help.reportsTo"); },
  get capabilities() { return t("agentConfig.help.capabilities"); },
  get adapterType() { return t("agentConfig.help.adapterType"); },
  get cwd() { return t("agentConfig.help.cwd"); },
  get promptTemplate() { return t("agentConfig.help.promptTemplate", { vars: "{{ agent.id }}, {{ agent.name }}, {{ agent.role }}" }); },
  get model() { return t("agentConfig.help.model"); },
  get thinkingEffort() { return t("agentConfig.help.thinkingEffort"); },
  get chrome() { return t("agentConfig.help.chrome"); },
  get dangerouslySkipPermissions() { return t("agentConfig.help.dangerouslySkipPermissions"); },
  get dangerouslyBypassSandbox() { return t("agentConfig.help.dangerouslyBypassSandbox"); },
  get search() { return t("agentConfig.help.search"); },
  get fastMode() { return t("agentConfig.help.fastMode"); },
  get workspaceStrategy() { return t("agentConfig.help.workspaceStrategy"); },
  get workspaceBaseRef() { return t("agentConfig.help.workspaceBaseRef"); },
  get workspaceBranchTemplate() {
    return t("agentConfig.help.workspaceBranchTemplate", {
      vars: "{{issue.identifier}}, {{issue.title}}, {{agent.name}}, {{project.id}}, {{workspace.repoRef}}",
      last: "{{slug}}",
    });
  },
  get worktreeParentDir() { return t("agentConfig.help.worktreeParentDir"); },
  get runtimeServicesJson() { return t("agentConfig.help.runtimeServicesJson"); },
  get maxTurnsPerRun() { return t("agentConfig.help.maxTurnsPerRun"); },
  get command() { return t("agentConfig.help.command"); },
  get localCommand() { return t("agentConfig.help.localCommand"); },
  get args() { return t("agentConfig.help.args"); },
  get extraArgs() { return t("agentConfig.help.extraArgs"); },
  get envVars() { return t("agentConfig.help.envVars"); },
  get secretAccess() { return t("agentConfig.help.secretAccess"); },
  get bootstrapPrompt() { return t("agentConfig.help.bootstrapPrompt"); },
  get payloadTemplateJson() { return t("agentConfig.help.payloadTemplateJson"); },
  get webhookUrl() { return t("agentConfig.help.webhookUrl"); },
  get heartbeatInterval() { return t("agentConfig.help.heartbeatInterval"); },
  get intervalSec() { return t("agentConfig.help.intervalSec"); },
  get timeoutSec() { return t("agentConfig.help.timeoutSec"); },
  get graceSec() { return t("agentConfig.help.graceSec"); },
  get wakeOnDemand() { return t("agentConfig.help.wakeOnDemand"); },
  get cooldownSec() { return t("agentConfig.help.cooldownSec"); },
  get maxConcurrentRuns() { return t("agentConfig.help.maxConcurrentRuns"); },
  get maxTurnContinuationEnabled() { return t("agentConfig.help.maxTurnContinuationEnabled"); },
  get maxTurnContinuationMaxAttempts() { return t("agentConfig.help.maxTurnContinuationMaxAttempts"); },
  get maxTurnContinuationDelaySec() { return t("agentConfig.help.maxTurnContinuationDelaySec"); },
  get budgetMonthlyCents() { return t("agentConfig.help.budgetMonthlyCents"); },
};

import { getAdapterLabels } from "../adapters/adapter-display-registry";

export const adapterLabels = getAdapterLabels();

export const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

/* ---- Primitive components ---- */

export function HintIcon({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          <HelpCircle className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode; configSection?: import("../adapters/types").AdapterConfigSection }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      {children}
    </div>
  );
}

export function ToggleField({
  label,
  hint,
  checked,
  onChange,
  toggleTestId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  toggleTestId?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        {hint && <HintIcon text={hint} />}
      </div>
      {/* Gallery feedback r3: was a hand-rolled h-5 w-9 pill with a bg-green-600
          track — the app's second switch implementation. Converged on the one
          canonical ToggleSwitch (status-green on-state), DESIGN.md principle 1. */}
      <ToggleSwitch
        data-testid={toggleTestId}
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function ToggleWithNumber({
  label,
  hint,
  checked,
  onCheckedChange,
  number,
  onNumberChange,
  numberLabel,
  numberHint,
  numberPrefix,
  showNumber,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  number: number;
  onNumberChange: (v: number) => void;
  numberLabel: string;
  numberHint?: string;
  numberPrefix?: string;
  showNumber: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{label}</span>
          {hint && <HintIcon text={hint} />}
        </div>
        <ToggleSwitch
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      </div>
      {showNumber && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {numberPrefix && <span>{numberPrefix}</span>}
          <input
            type="number"
            className="w-16 rounded-md border border-border px-2 py-0.5 bg-transparent outline-none text-xs font-mono text-center"
            value={number}
            onChange={(e) => onNumberChange(Number(e.target.value))}
          />
          <span>{numberLabel}</span>
          {numberHint && <HintIcon text={numberHint} />}
        </div>
      )}
    </div>
  );
}

export function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  bordered,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(bordered && "border-t border-border")}>
      <button
        type="button"
        aria-expanded={open}
        className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/30 transition-colors"
        onClick={onToggle}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {icon}
        {title}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export function AutoExpandTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  minRows,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rows = minRows ?? 3;
  const lineHeight = 20;
  const minHeight = rows * lineHeight;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { adjustHeight(); }, [value, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40 resize-none overflow-hidden"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      style={{ minHeight }}
    />
  );
}

/**
 * Text input that manages internal draft state.
 * Calls `onCommit` on blur (and optionally on every change if `immediate` is set).
 */
export function DraftInput({
  value,
  onCommit,
  immediate,
  className,
  ...props
}: {
  value: string;
  onCommit: (v: string) => void;
  immediate?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <input
      className={className}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      {...props}
    />
  );
}

/**
 * Auto-expanding textarea with draft state and blur-commit.
 */
export function DraftTextarea({
  value,
  onCommit,
  immediate,
  placeholder,
  minRows,
}: {
  value: string;
  onCommit: (v: string) => void;
  immediate?: boolean;
  placeholder?: string;
  minRows?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rows = minRows ?? 3;
  const lineHeight = 20;
  const minHeight = rows * lineHeight;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { adjustHeight(); }, [draft, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40 resize-none overflow-hidden"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      style={{ minHeight }}
    />
  );
}

/**
 * Number input with draft state and blur-commit.
 */
export function DraftNumberInput({
  value,
  onCommit,
  immediate,
  className,
  ...props
}: {
  value: number;
  onCommit: (v: number) => void;
  immediate?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "type">) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <input
      type="number"
      className={className}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(Number(e.target.value) || 0);
      }}
      onBlur={() => {
        const num = Number(draft) || 0;
        if (num !== value) onCommit(num);
      }}
      {...props}
    />
  );
}

/**
 * "Choose" button that opens a dialog explaining the user must manually
 * type the path due to browser security limitations.
 */
export function ChoosePathButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors shrink-0"
        onClick={() => setOpen(true)}
      >
        {t("agentConfig.primitives.choose")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("agentConfig.primitives.choosePathTitle")}</DialogTitle>
            <DialogDescription>
              {t("agentConfig.primitives.choosePathDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <section className="space-y-1.5">
              <p className="font-medium">{t("agentConfig.primitives.macTitle")}</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>{t("agentConfig.primitives.macStep1")}</li>
                <li>
                  {t("agentConfig.primitives.holdPrefix")}
                  <kbd>{t("agentConfig.primitives.optionKey")}</kbd>
                  {t("agentConfig.primitives.holdSuffix")}
                </li>
                <li>{t("agentConfig.primitives.macStep3")}</li>
                <li>{t("agentConfig.primitives.pastePath")}</li>
              </ol>
              <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                /Users/yourname/Documents/project
              </p>
            </section>
            <section className="space-y-1.5">
              <p className="font-medium">{t("agentConfig.primitives.windowsTitle")}</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>{t("agentConfig.primitives.winStep1")}</li>
                <li>
                  {t("agentConfig.primitives.holdPrefix")}
                  <kbd>{t("agentConfig.primitives.shiftKey")}</kbd>
                  {t("agentConfig.primitives.holdSuffix")}
                </li>
                <li>{t("agentConfig.primitives.winStep3")}</li>
                <li>{t("agentConfig.primitives.pastePath")}</li>
              </ol>
              <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                C:\Users\yourname\Documents\project
              </p>
            </section>
            <section className="space-y-1.5">
              <p className="font-medium">{t("agentConfig.primitives.terminalTitle")}</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>
                  {t("agentConfig.primitives.runPrefix")}
                  <code>cd /path/to/folder</code>
                  {t("agentConfig.primitives.runSuffix")}
                </li>
                <li>
                  {t("agentConfig.primitives.runPrefix")}
                  <code>pwd</code>
                  {t("agentConfig.primitives.runSuffix")}
                </li>
                <li>{t("agentConfig.primitives.terminalStep3")}</li>
              </ol>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("agentConfig.primitives.ok")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Label + input rendered on the same line (inline layout for compact fields).
 */
export function InlineField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 shrink-0">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      <div className="w-24 ml-auto">{children}</div>
    </div>
  );
}
