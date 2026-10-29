import { Pause, Play, Square, Volume2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useSpeech } from "@/hooks/useSpeech";
import { markdownToSpeechText } from "@/lib/speech/speech-text";
import { cn } from "@/lib/utils";
import { SpeechSettingsButton } from "./SpeechSettingsPanel";

const ICON_BUTTON_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

/**
 * Icon button that reads an agent reply aloud. The reply's own language picks the voice.
 * Renders nothing when the browser has no Web Speech API or there is no text.
 */
export function ListenButton({
  id,
  text,
  className,
}: {
  id: string;
  text: string;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const { supported, state, controller } = useSpeech();

  if (!supported || !controller || !text.trim()) return null;

  const isCurrent = state.currentId === id;
  const speaking = isCurrent && state.status === "speaking";
  const paused = isCurrent && state.status === "paused";
  const active = speaking || paused;

  const label = speaking
    ? t("speech.pause")
    : paused
      ? t("speech.resume")
      : t("speech.listen");
  const Icon = speaking ? Pause : paused ? Play : Volume2;

  const handleClick = () => {
    if (speaking) {
      controller.pause();
    } else if (paused) {
      controller.resume();
    } else {
      const spoken = markdownToSpeechText(text, { codePlaceholder: t("speech.codeOmitted") });
      if (spoken) controller.speak(id, spoken, { lang: i18n.language });
    }
  };

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <button
        type="button"
        className={ICON_BUTTON_CLASS}
        title={label}
        aria-label={label}
        onClick={handleClick}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
      {active ? (
        <>
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            title={t("speech.stop")}
            aria-label={t("speech.stop")}
            onClick={() => controller.stop()}
          >
            <Square className="h-3.5 w-3.5" />
          </button>
          <SpeechSettingsButton className={ICON_BUTTON_CLASS} />
        </>
      ) : null}
    </span>
  );
}
