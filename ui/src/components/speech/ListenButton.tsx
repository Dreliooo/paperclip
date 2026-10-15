import { useEffect, useId, useState } from "react";
import { Pause, Play, Square, SlidersHorizontal, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "@/i18n";
import { useSpeech } from "@/hooks/useSpeech";
import type { SpeechController, VoiceLike } from "@/lib/speech/speech-controller";
import { markdownToSpeechText } from "@/lib/speech/speech-text";
import { cn } from "@/lib/utils";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

const ICON_BUTTON_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

function useVoices(controller: SpeechController | null): VoiceLike[] {
  const [voices, setVoices] = useState<VoiceLike[]>(() => controller?.getVoices() ?? []);
  useEffect(() => {
    if (!controller) return;
    const refresh = () => setVoices(controller.getVoices());
    refresh();
    // Voices load asynchronously in most browsers; refresh when the list changes.
    return controller.subscribeVoices(refresh);
  }, [controller]);
  return voices;
}

/**
 * Icon button that reads an agent reply aloud with the device's built-in voices.
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
  const voices = useVoices(controller);
  const voiceSelectId = useId();

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
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={ICON_BUTTON_CLASS}
                title={t("speech.settings")}
                aria-label={t("speech.settings")}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-3 p-3">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-foreground">{t("speech.speed")}</div>
                <div className="flex flex-wrap gap-1">
                  {SPEED_OPTIONS.map((speed) => {
                    const selected = state.rate === speed;
                    return (
                      <Button
                        key={speed}
                        type="button"
                        size="xs"
                        variant={selected ? "secondary" : "outline"}
                        aria-pressed={selected}
                        onClick={() => controller.setRate(speed)}
                      >
                        {`${speed}×`}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={voiceSelectId} className="text-xs font-medium text-foreground">
                  {t("speech.voice")}
                </label>
                <select
                  id={voiceSelectId}
                  className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  value={state.voiceURI ?? ""}
                  onChange={(event) => controller.setVoice(event.target.value || null)}
                >
                  <option value="">{t("speech.systemVoice")}</option>
                  {voices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.localService
                        ? `${voice.name} (${voice.lang})`
                        : `${voice.name} (${voice.lang}) — ${t("speech.onlineVoice")}`}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">{t("speech.localOnly")}</p>
            </PopoverContent>
          </Popover>
        </>
      ) : null}
    </span>
  );
}
