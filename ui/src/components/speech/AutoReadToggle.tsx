import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AudioLines } from "lucide-react";
import { useTranslation } from "@/i18n";
import {
  getSpeechController,
  type SpeechController,
} from "@/lib/speech/speech-controller";
import { cn } from "@/lib/utils";

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
export function AutoReadToggle({ autoReadKey }: { autoReadKey: string }) {
  const { t } = useTranslation();
  const controller = getSpeechController();
  const enabled = useAutoReadEnabled(controller, autoReadKey);

  if (!controller) return null;

  return (
    <button
      type="button"
      aria-pressed={enabled}
      title={t("speech.autoReadHint")}
      onClick={() => controller.setAutoRead(autoReadKey, !enabled)}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors hover:bg-accent hover:text-foreground",
        enabled ? "bg-accent text-foreground" : "text-muted-foreground",
      )}
    >
      <AudioLines className="h-3.5 w-3.5" />
      <span>{enabled ? t("speech.autoReadOn") : t("speech.autoRead")}</span>
    </button>
  );
}

export interface AutoReadMessage {
  id: string;
  text: string;
  /** Epoch ms the reply arrived; null when unknown (never auto-read). */
  atMs: number | null;
}

/**
 * While auto-read is on for `autoReadKey`, queues each message that arrived
 * after it was enabled, once. Callers pass only final agent replies.
 */
export function useAutoReadReplies({
  autoReadKey,
  messages,
}: {
  autoReadKey: string;
  messages: AutoReadMessage[];
}): void {
  const { i18n } = useTranslation();
  const controller = getSpeechController();
  const enabled = useAutoReadEnabled(controller, autoReadKey);

  useEffect(() => {
    if (!controller || !enabled) return;
    const since = controller.autoReadEnabledAt(autoReadKey);
    if (since === null) return;
    for (const message of messages) {
      if (message.atMs === null || message.atMs < since) continue;
      if (enqueuedMessageIds.has(message.id)) continue;
      enqueuedMessageIds.add(message.id);
      controller.enqueue(message.id, message.text, { lang: i18n.language });
    }
  }, [controller, enabled, autoReadKey, messages, i18n.language]);
}
