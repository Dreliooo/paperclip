import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Agent } from "@paperclipai/shared";
import { AgentIcon } from "@/components/AgentIconPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useTranslation } from "@/i18n";

export interface AgentChatPickerProps {
  agents: Agent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (agent: Agent, signal?: AbortSignal) => void | Promise<void>;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  existingChatAgentIds?: readonly string[];
  renderAgentIcon?: (agent: Agent) => ReactNode;
}

export function AgentChatPicker({ open, onOpenChange, ...props }: AgentChatPickerProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="px-4 pt-4 pb-3">
          <DialogTitle>{t("agentDetail.picker.title")}</DialogTitle>
          {props.existingChatAgentIds && <p className="mt-2 text-sm text-muted-foreground">{t("agentDetail.picker.description")}</p>}
        </div>
        {/* The dialog unmounts its content on close, so each search starts empty. */}
        <AgentChatPickerResults key={String(open)} {...props} onComplete={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AgentChatPickerResults({ agents, onSelect, onComplete, loading, error, onRetry, existingChatAgentIds, renderAgentIcon }: Omit<AgentChatPickerProps, "open" | "onOpenChange"> & { onComplete: () => void }) {
  const { t } = useTranslation();
  const mounted = useRef(false);
  const selection = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; selection.current?.abort(); };
  }, []);
  const [search, setSearch] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  async function selectAgent(agent: Agent) {
    if (openingId) return;
    setOpeningId(agent.id);
    setSelectionError(null);
    const request = new AbortController();
    selection.current = request;
    try {
      await onSelect(agent, request.signal);
      if (mounted.current) onComplete();
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : t("agentDetail.shared.openChatError"));
    } finally {
      setOpeningId(null);
    }
  }
  return (
    <Command>
      <CommandInput
        aria-label={t("agentDetail.picker.searchLabel")}
        placeholder={t("agentDetail.picker.searchPlaceholder")}
        value={search}
        onValueChange={setSearch}
      />
      {selectionError && <p role="alert" className="px-4 py-3 text-sm text-destructive">{selectionError}</p>}
      {openingId && <p role="status" className="sr-only">{t("agentDetail.picker.openingConversation")}</p>}
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm">
          <p>{t("agentDetail.picker.loadAgentsError")}</p>
          {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>{t("agentDetail.shared.retry")}</Button>}
        </div>
      ) : loading ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">{t("agentDetail.shared.loadingAgents")}</p>
      ) : (
        <CommandList>
          <CommandEmpty>
            <div className="flex flex-col items-center gap-2 px-4">
              <span>{agents.length ? t("agentDetail.picker.noMatch", { search }) : t("agentDetail.picker.noAgentsYet")}</span>
              {agents.length ? <>
                <span className="text-xs text-muted-foreground">{t("agentDetail.shared.tryAnotherNameOrRole")}</span>
                <Button variant="ghost" size="sm" onClick={() => setSearch("")}>{t("agentDetail.shared.clearSearch")}</Button>
              </> : <span className="text-xs text-muted-foreground">{t("agentDetail.picker.createAgentHint")}</span>}
            </div>
          </CommandEmpty>
          <CommandGroup>
            {agents.map((agent) => (
              <CommandItem
                key={agent.id}
                value={agent.id}
                keywords={[agent.name, agent.title ?? "", agent.role]}
                onSelect={() => { void selectAgent(agent); }}
                disabled={openingId !== null}
                className="gap-3 px-3 py-3"
              >
                {renderAgentIcon ? renderAgentIcon(agent) : <AgentIcon icon={agent.icon} className="size-4 shrink-0" />}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{agent.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{agent.title ?? agent.role}</span>
                </span>
                {existingChatAgentIds && <span className="shrink-0 text-xs text-muted-foreground">{existingChatAgentIds.includes(agent.id) ? t("agentDetail.picker.openChat") : t("agentDetail.picker.newChat")}</span>}
                {agent.status === "paused" && <span className="text-xs text-(--status-agent-paused)">{t("agentDetail.shared.statusPaused")}</span>}
                {agent.status === "terminated" && <span className="text-xs text-muted-foreground">{t("agentDetail.shared.statusTerminated")}</span>}
                {agent.status === "pending_approval" && <span className="text-xs text-muted-foreground">{t("agentDetail.picker.awaitingApproval")}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      )}
    </Command>
  );
}
