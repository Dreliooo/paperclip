import { Mic, MicOff, Phone, PhoneOff, RotateCcw, Volume2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";

export const VOICE_CONTROL_STATES = ["idle", "connecting", "listening", "speaking", "working", "interrupted", "reconnecting", "ending", "ended", "failed", "cleanup_failed"] as const;
export type VoiceControlState = typeof VOICE_CONTROL_STATES[number];
const labelKeys: Record<VoiceControlState, string> = {
  idle: "ui2g3.voiceControls.status.idle", connecting: "ui2g3.voiceControls.status.connecting", listening: "ui2g3.voiceControls.status.listening", speaking: "ui2g3.voiceControls.status.speaking",
  working: "ui2g3.voiceControls.status.working", interrupted: "ui2g3.voiceControls.status.interrupted", reconnecting: "ui2g3.voiceControls.status.reconnecting",
  ending: "ui2g3.voiceControls.status.ending", ended: "ui2g3.voiceControls.status.ended", failed: "ui2g3.voiceControls.status.failed", cleanup_failed: "ui2g3.voiceControls.status.cleanupFailed",
};
export interface VoiceControlsProps {
  state: VoiceControlState;
  agentName: string;
  muted?: boolean;
  busy?: boolean;
  playbackBlocked?: boolean;
  canRepeat?: boolean;
  onRepeat?: () => void;
  error?: string;
  announcement?: string;
  onStart: () => void;
  onMute: () => void;
  onEnd: () => void;
  onResumeAudio: () => void;
  className?: string;
}
export function VoiceControls({ state, agentName, muted = false, busy = false, playbackBlocked = false, canRepeat = false, onRepeat, error, announcement, onStart, onMute, onEnd, onResumeAudio, className }: VoiceControlsProps) {
  const { t } = useTranslation();
  const inactive = state === "idle" || state === "ended" || state === "failed";
  const connecting = state === "connecting" || state === "reconnecting";
  const startButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!inactive || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement === document.body) startButton.current?.focus();
  }, [inactive]);
  return (
    <section aria-label={t("ui2g3.voiceControls.sectionLabel", { name: agentName })} className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="break-words text-sm font-medium">{t("ui2g3.voiceControls.talkTo", { name: agentName })}</h3>
        <p role="status" className="text-sm text-muted-foreground">{t(labelKeys[state])}{muted && !inactive ? t("ui2g3.voiceControls.mutedSuffix") : ""}</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {inactive ? (
          <Button ref={startButton} size="sm" disabled={busy} onClick={onStart}><Phone aria-hidden="true" />{state === "failed" ? t("ui2g3.voiceControls.tryAgain") : t("ui2g3.voiceControls.startVoice")}</Button>
        ) : (
          <>
            <Button size="sm" variant="outline" aria-pressed={muted} disabled={busy || connecting || state === "ending" || state === "cleanup_failed"} onClick={onMute}>
              {muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}{muted ? t("ui2g3.voiceControls.unmute") : t("ui2g3.voiceControls.mute")}
            </Button>
            <Button size="sm" variant="outline" disabled={state === "ending"} onClick={() => { restoreFocus.current = true; onEnd(); }}><PhoneOff aria-hidden="true" />{state === "cleanup_failed" ? t("ui2g3.voiceControls.retryEnding") : t("ui2g3.voiceControls.endCall")}</Button>
          </>
        )}
        {canRepeat && onRepeat && !inactive && <Button size="sm" variant="outline" disabled={busy || connecting || state === "ending" || state === "cleanup_failed"} onClick={onRepeat}><RotateCcw aria-hidden="true" />{t("ui2g3.voiceControls.repeatAnswer")}</Button>}
        {playbackBlocked && !inactive && <Button size="sm" variant="outline" onClick={onResumeAudio}><Volume2 aria-hidden="true" />{t("ui2g3.voiceControls.enableAudio")}</Button>}
      </div>
      {!inactive && <p className="text-xs text-muted-foreground">{t("ui2g3.voiceControls.keepsTaskRunning")}</p>}
      <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
    </section>
  );
}
