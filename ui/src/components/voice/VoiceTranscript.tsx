import { useTranslation } from "@/i18n";
import type { VoiceTranscriptEntry } from "@/lib/voice-transcript";

export interface VoiceTranscriptProps {
  entries: readonly VoiceTranscriptEntry[];
  agentName: string;
  unavailable?: boolean;
}

/** Announcements belong to the session controller, once per final segment. */
export function VoiceTranscript({ entries, agentName, unavailable = false }: VoiceTranscriptProps) {
  const { t } = useTranslation();
  if (unavailable) return <p className="text-sm text-muted-foreground">{t("ui2g2.voiceTranscript.unavailable")}</p>;
  if (!entries.length) return <p className="text-sm text-muted-foreground">{t("ui2g2.voiceTranscript.empty")}</p>;
  return (
    <ol aria-label={t("ui2g2.voiceTranscript.ariaLabel")} aria-live="off" className="flex min-w-0 flex-col gap-4">
      {entries.map((entry) => (
        <li key={entry.id} className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground break-words">
            {entry.source === "user" ? t("ui2g2.voiceTranscript.you") : entry.source === "application" ? "Paperclip" : agentName}
            {!entry.final && !entry.interrupted && <span> · {t("ui2g2.voiceTranscript.speaking")}</span>}
            {entry.interrupted && <span> · {t("ui2g2.voiceTranscript.interrupted")}</span>}
          </span>
          <p className="whitespace-pre-wrap break-words text-sm">{entry.text}</p>
        </li>
      ))}
    </ol>
  );
}
