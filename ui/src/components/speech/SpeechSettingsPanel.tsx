import { useEffect, useId, useState } from "react";
import { Play, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useTranslation } from "@/i18n";
import { useSpeech } from "@/hooks/useSpeech";
import type { SpeechController, VoiceLike } from "@/lib/speech/speech-controller";
import { primaryLanguage } from "@/lib/speech/voice-ranking";

const SPEED_OPTIONS = [0.85, 1, 1.15, 1.3, 1.6] as const;
const LANGUAGES = ["es", "en", "pt"] as const;
const PREVIEW_ID = "__speech-preview__";

/** Re-render when the browser finishes loading its voices (they arrive asynchronously). */
export function useVoicesVersion(controller: SpeechController | null): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!controller) return;
    setVersion((value) => value + 1);
    return controller.subscribeVoices(() => setVersion((value) => value + 1));
  }, [controller]);
  return version;
}

function voiceLabel(voice: VoiceLike) {
  return `${voice.name.replace(/^Microsoft\s+/, "").replace(/\s+-\s+.*$/, "")} (${voice.lang})`;
}

/**
 * Speed, voice per language with a preview, and the online-voices opt-in.
 * Online voices sound much better but send the text to the browser vendor,
 * so they stay off until the person turns them on here.
 */
export function SpeechSettingsPanel({ lang }: { lang?: string | null }) {
  const { t, i18n } = useTranslation();
  const { state, controller } = useSpeech();
  useVoicesVersion(controller);
  const selectId = useId();
  const onlineId = useId();
  const [language, setLanguage] = useState(() => primaryLanguage(lang || state.currentLang || i18n.language) || "es");

  if (!controller) return null;

  const ranked = controller.rankedVoices(language);
  const chosen = state.voiceByLang[language] ?? "";
  const automatic = ranked[0]?.voice ?? null;
  const naturalAvailable = ranked.some((entry) => entry.natural);
  const preview = () => {
    const voiceURI = chosen || automatic?.voiceURI;
    controller.speak(PREVIEW_ID, t(`speech.previewText.${language}`), { lang: language, voiceURI });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-foreground">{t("speech.speed")}</div>
        <div className="flex flex-wrap gap-1">
          {SPEED_OPTIONS.map((speed) => {
            const selected = Math.abs(state.rate - speed) < 0.01;
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
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={selectId} className="text-xs font-medium text-foreground">{t("speech.voice")}</label>
          <div className="flex gap-1" role="group" aria-label={t("speech.language")}>
            {LANGUAGES.map((code) => (
              <Button
                key={code}
                type="button"
                size="xs"
                variant={language === code ? "secondary" : "ghost"}
                aria-pressed={language === code}
                onClick={() => setLanguage(code)}
              >
                {code.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NativeSelect
            id={selectId}
            className="h-7 min-w-0 flex-1 text-xs"
            value={chosen}
            onChange={(event) => controller.setVoice(language, event.target.value || null)}
          >
            <option value="">
              {automatic
                ? t("speech.automaticVoice", { name: voiceLabel(automatic) })
                : t("speech.systemVoice")}
            </option>
            {ranked.map((entry) => (
              <option key={entry.voice.voiceURI} value={entry.voice.voiceURI}>
                {voiceLabel(entry.voice)}
                {entry.natural ? ` · ${t("speech.naturalVoice")}` : ""}
                {entry.online ? ` · ${t("speech.onlineVoiceShort")}` : ""}
              </option>
            ))}
          </NativeSelect>
          <Button type="button" size="xs" variant="outline" onClick={preview} title={t("speech.preview")}>
            <Play className="h-3 w-3" />
            {t("speech.preview")}
          </Button>
        </div>
        {ranked.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("speech.noVoices")}</p>
        ) : !naturalAvailable ? (
          <p className="text-xs text-muted-foreground">{t("speech.betterVoicesHint")}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={onlineId} className="text-xs font-medium text-foreground">{t("speech.onlineVoices")}</label>
          <ToggleSwitch
            id={onlineId}
            checked={state.allowOnlineVoices}
            onCheckedChange={(checked) => controller.setAllowOnlineVoices(checked)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t(state.allowOnlineVoices ? "speech.onlineVoicesOn" : "speech.onlineVoicesOff")}
        </p>
      </div>
    </div>
  );
}

/** Icon button that opens the reading settings; always available, also when nothing is playing. */
export function SpeechSettingsButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { supported, state } = useSpeech();
  if (!supported) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={className ?? "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"}
          title={t("speech.settings")}
          aria-label={t("speech.settings")}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <SpeechSettingsPanel lang={state.currentLang} />
      </PopoverContent>
    </Popover>
  );
}
