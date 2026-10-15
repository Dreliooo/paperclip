import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AudioLines } from "lucide-react";
import { useTranslation } from "@/i18n";
import {
  getSpeechController,
  type SpeechController,
} from "@/lib/speech/speech-controller";
import { cn } from "@/lib/utils";
import { markdownToSpeechText } from "@/lib/speech/speech-text";

/** Message ids already handed to the speech queue. Module-level so remounts never repeat a reply. */
const enqueuedMessageIds = new Set<string>();

const noopUnsubscribe = () => {};

function useAutoReadEnabled(controller: SpeechController | null, autoReadKey: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => (controller ? controller.subscribe(listener) : noopUnsubscribe),
    [controller],
  );
  const getSnapshot = useCallback(
    () => controller?.isAutoRead(autoReadKey) ?? false,
    [controller, autoReadKey],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Toggle for reading new agent replies in one conversation. Renders nothing without Web Speech. */
export function AutoReadToggle({
  autoReadKey,
  scope = "conversation",
}: {
  autoReadKey: string;
  /** "agent" labels the toggle for one agent across all its conversations. */
  scope?: "conversation" | "agent";
}) {
  const { t } = useTranslation();
  const controller = getSpeechController();
  const enabled = useAutoReadEnabled(controller, autoReadKey);

  if (!controller) return null;

  return (
    <button
      type="button"
      aria-pressed={enabled}
      title={t(scope === "agent" ? "speech.autoReadAgentHint" : "speech.autoReadHint")}
      onClick={() => controller.setAutoRead(autoReadKey, !enabled)}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors hover:bg-accent hover:text-foreground",
        enabled ? "bg-accent text-foreground" : "text-muted-foreground",
      )}
    >
      <AudioLines className="h-3.5 w-3.5" />
      <span>{enabled ? t("speech.autoReadOn") : t(scope === "agent" ? "speech.autoReadAgent" : "speech.autoRead")}</span>
    </button>
  );
}

export interface AutoReadMessage {
  id: string;
  text: string;
  /** Epoch ms the reply arrived; null when unknown (never auto-read). */
  atMs: number | null;
  /** Authoring agent, so "read this agent aloud" works in any conversation. */
  agentId?: string | null;
}

/** Auto-read key for one agent across every conversation it replies in. */
export function agentAutoReadKey(agentId: string) {
  return `agent:${agentId}`;
}

/**
 * While auto-read is on for the conversation (`autoReadKey`) or for the
 * message's agent, queues each reply that arrived after it was enabled, once.
 * Callers pass only final agent replies. Replies are read one at a time.
 */
export function useAutoReadReplies({
  autoReadKey,
  messages,
}: {
  autoReadKey: string;
  messages: AutoReadMessage[];
}): void {
  const { t, i18n } = useTranslation();
  const controller = getSpeechController();
  const subscribe = useCallback(
    (listener: () => void) => (controller ? controller.subscribe(listener) : noopUnsubscribe),
    [controller],
  );
  const getSnapshot = useCallback(() => controller?.getState() ?? null, [controller]);
  // Re-run whenever any auto-read switch (conversation or agent) changes.
  const speechState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!controller) return;
    for (const message of messages) {
      if (message.atMs === null || enqueuedMessageIds.has(message.id)) continue;
      const keys = [autoReadKey, message.agentId ? agentAutoReadKey(message.agentId) : null];
      const since = keys
        .map((key) => (key ? controller.autoReadEnabledAt(key) : null))
        .filter((value): value is number => value !== null);
      if (since.length === 0 || message.atMs < Math.min(...since)) continue;
      enqueuedMessageIds.add(message.id);
      // Same speakable text as the Listen button: no code blocks or URLs.
      const spoken = markdownToSpeechText(message.text, { codePlaceholder: t("speech.codeOmitted") });
      if (spoken) controller.enqueue(message.id, spoken, { lang: i18n.language });
    }
  }, [controller, speechState, autoReadKey, messages, i18n.language, t]);
}
