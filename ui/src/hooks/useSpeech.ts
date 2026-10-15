import { useCallback, useSyncExternalStore } from "react";
import {
  getSpeechController,
  SPEECH_DEFAULT_RATE,
  type SpeechController,
  type SpeechState,
} from "@/lib/speech/speech-controller";

const IDLE_STATE: SpeechState = {
  status: "idle",
  currentId: null,
  queueLength: 0,
  rate: SPEECH_DEFAULT_RATE,
  voiceURI: null,
};

const noopUnsubscribe = () => {};

/**
 * Reads the app-wide "Listen" controller. `supported` is false when the browser
 * has no Web Speech API; `controller` is then null and `state` stays idle.
 */
export function useSpeech(): {
  supported: boolean;
  state: SpeechState;
  controller: SpeechController | null;
} {
  const controller = getSpeechController();
  const subscribe = useCallback(
    (listener: () => void) =>
      controller ? controller.subscribe(listener) : noopUnsubscribe,
    [controller],
  );
  const getSnapshot = useCallback(
    () => (controller ? controller.getState() : IDLE_STATE),
    [controller],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { supported: controller !== null, state, controller };
}
