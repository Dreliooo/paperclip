import { splitIntoSpeechChunks } from "./speech-text";

/**
 * Framework-agnostic controller for "Listen". It drives one speech synthesizer
 * with at most one utterance in flight: queued text is split into chunks and
 * each chunk is handed to the synthesizer only after the previous one ended.
 * Nothing leaves the device; voices come from the browser's built-in set.
 */

export type SpeechStatus = "idle" | "speaking" | "paused";

export interface SpeechState {
  status: SpeechStatus;
  /** Message id currently being read (or paused). */
  currentId: string | null;
  /** Chunks waiting behind the one in flight. */
  queueLength: number;
  rate: number;
  voiceURI: string | null;
}

export interface VoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
}

export interface UtteranceLike {
  text: string;
  rate: number;
  voice: VoiceLike | null;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

/** The subset of `SpeechSynthesis` the controller uses. */
export interface SpeechSynthesisLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  getVoices(): VoiceLike[];
  addEventListener?(type: "voiceschanged", listener: () => void): void;
  removeEventListener?(type: "voiceschanged", listener: () => void): void;
}

/** The subset of the Web Storage API the controller uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SpeakOptions {
  /** BCP 47 language of the text, e.g. "es-AR". Used to pick a voice. */
  lang?: string;
}

export type SpeechListener = () => void;

export interface SpeechController {
  /** Stops anything playing, clears the queue and reads `text` from the start. */
  speak(id: string, text: string, opts?: SpeakOptions): void;
  /** Appends `text` to the queue, starting it when nothing is playing. */
  enqueue(id: string, text: string, opts?: SpeakOptions): void;
  pause(): void;
  resume(): void;
  /** Cancels playback and clears the queue. */
  stop(): void;
  /** Clamped to 0.5–2 and persisted. */
  setRate(rate: number): void;
  /** Persisted. `null` selects the system default voice. */
  setVoice(voiceURI: string | null): void;
  getVoices(): VoiceLike[];
  subscribeVoices(listener: SpeechListener): () => void;
  subscribe(listener: SpeechListener): () => void;
  getState(): SpeechState;
  isAutoRead(key: string): boolean;
  setAutoRead(key: string, enabled: boolean): void;
  /** Epoch ms when auto-read was enabled for `key`, or null when it is off. */
  autoReadEnabledAt(key: string): number | null;
}

export const SPEECH_SETTINGS_STORAGE_KEY = "paperclip:speech:settings";
export const SPEECH_AUTO_READ_STORAGE_KEY = "paperclip:speech:auto-read";
export const SPEECH_AUTO_READ_AT_STORAGE_KEY = "paperclip:speech:auto-read-at";
export const SPEECH_MIN_RATE = 0.5;
export const SPEECH_MAX_RATE = 2;
export const SPEECH_DEFAULT_RATE = 1;

interface QueuedChunk {
  id: string;
  text: string;
  lang: string | undefined;
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return SPEECH_DEFAULT_RATE;
  return Math.min(SPEECH_MAX_RATE, Math.max(SPEECH_MIN_RATE, rate));
}

function primarySubtag(tag: string | undefined): string {
  return (tag ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

function readJson(storage: StorageLike | undefined, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(storage: StorageLike | undefined, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or blocked; the in-memory preference still applies.
  }
}

function loadAutoReadKeys(storage: StorageLike | undefined): string[] {
  const value = readJson(storage, SPEECH_AUTO_READ_STORAGE_KEY);
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : [];
}

function loadAutoReadAt(storage: StorageLike | undefined): Record<string, number> {
  const value = readJson(storage, SPEECH_AUTO_READ_AT_STORAGE_KEY);
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, ms] of Object.entries(value)) {
    if (typeof ms === "number" && Number.isFinite(ms)) result[key] = ms;
  }
  return result;
}

export function createSpeechController(
  synth: SpeechSynthesisLike,
  createUtterance: (text: string) => UtteranceLike,
  storage?: StorageLike,
): SpeechController {
  const savedSettings = readJson(storage, SPEECH_SETTINGS_STORAGE_KEY) as
    | { rate?: unknown; voiceURI?: unknown }
    | null;
  let rate =
    savedSettings && typeof savedSettings.rate === "number"
      ? clampRate(savedSettings.rate)
      : SPEECH_DEFAULT_RATE;
  let voiceURI =
    savedSettings && typeof savedSettings.voiceURI === "string" && savedSettings.voiceURI
      ? savedSettings.voiceURI
      : null;

  const autoReadKeys = loadAutoReadKeys(storage);
  const autoReadAt = loadAutoReadAt(storage);

  let queue: QueuedChunk[] = [];
  let status: SpeechStatus = "idle";
  let currentId: string | null = null;
  // Bumped whenever playback is reset so callbacks from cancelled utterances are ignored.
  let generation = 0;
  let inFlight = false;
  const listeners = new Set<SpeechListener>();

  function buildSnapshot(): SpeechState {
    return { status, currentId, queueLength: queue.length, rate, voiceURI };
  }

  // Cached so useSyncExternalStore sees a new identity only when state changes.
  let snapshot: SpeechState = buildSnapshot();

  function emit(): void {
    snapshot = buildSnapshot();
    for (const listener of [...listeners]) listener();
  }

  function getVoices(): VoiceLike[] {
    try {
      return synth.getVoices() ?? [];
    } catch {
      return [];
    }
  }

  function pickVoice(lang: string | undefined): VoiceLike | null {
    const voices = getVoices();
    if (voiceURI) {
      const chosen = voices.find((voice) => voice.voiceURI === voiceURI);
      if (chosen) return chosen;
    }
    const primary = primarySubtag(lang);
    if (!primary) return null;
    // Automatic choice never picks an online voice: those (e.g. Chrome's
    // "Google …" voices) send the text to the browser vendor. Online voices are
    // used only when the person selects one explicitly.
    const matches = voices.filter((voice) => primarySubtag(voice.lang) === primary && voice.localService);
    return matches[0] ?? null;
  }

  /** Cancels whatever is playing and empties the queue. */
  function resetPlayback(): void {
    generation += 1;
    queue = [];
    inFlight = false;
    if (status === "paused") synth.resume();
    status = "idle";
    currentId = null;
    synth.cancel();
  }

  function startNext(): void {
    if (status === "paused" || inFlight) {
      emit();
      return;
    }
    const next = queue.shift();
    if (!next) {
      status = "idle";
      currentId = null;
      emit();
      return;
    }

    inFlight = true;
    status = "speaking";
    currentId = next.id;
    const gen = generation;
    const utterance = createUtterance(next.text);
    utterance.rate = rate;
    utterance.lang = next.lang ?? "";
    utterance.voice = pickVoice(next.lang);
    const finish = () => {
      if (gen !== generation) return;
      inFlight = false;
      startNext();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
    emit();
  }

  function chunksFor(id: string, text: string, opts?: SpeakOptions): QueuedChunk[] {
    return splitIntoSpeechChunks(text).map((chunk) => ({ id, text: chunk, lang: opts?.lang }));
  }

  function persistSettings(): void {
    writeJson(storage, SPEECH_SETTINGS_STORAGE_KEY, { rate, voiceURI });
  }

  function persistAutoRead(): void {
    writeJson(storage, SPEECH_AUTO_READ_STORAGE_KEY, autoReadKeys);
    writeJson(storage, SPEECH_AUTO_READ_AT_STORAGE_KEY, autoReadAt);
  }

  return {
    speak(id, text, opts) {
      resetPlayback();
      queue = chunksFor(id, text, opts);
      startNext();
    },

    enqueue(id, text, opts) {
      const chunks = chunksFor(id, text, opts);
      if (chunks.length === 0) return;
      queue.push(...chunks);
      if (status === "idle") startNext();
      else emit();
    },

    pause() {
      if (status !== "speaking") return;
      synth.pause();
      status = "paused";
      emit();
    },

    resume() {
      if (status !== "paused") return;
      synth.resume();
      status = "speaking";
      emit();
    },

    stop() {
      resetPlayback();
      emit();
    },

    setRate(next) {
      rate = clampRate(next);
      persistSettings();
      emit();
    },

    setVoice(next) {
      voiceURI = next || null;
      persistSettings();
      emit();
    },

    getVoices,

    subscribeVoices(listener) {
      if (!synth.addEventListener || !synth.removeEventListener) return () => {};
      const handler = () => listener();
      synth.addEventListener("voiceschanged", handler);
      return () => synth.removeEventListener?.("voiceschanged", handler);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getState() {
      return snapshot;
    },

    isAutoRead(key) {
      return autoReadKeys.includes(key);
    },

    setAutoRead(key, enabled) {
      if (enabled) {
        if (!autoReadKeys.includes(key)) autoReadKeys.push(key);
        if (autoReadAt[key] === undefined) autoReadAt[key] = Date.now();
      } else {
        const index = autoReadKeys.indexOf(key);
        if (index !== -1) autoReadKeys.splice(index, 1);
        delete autoReadAt[key];
      }
      persistAutoRead();
      emit();
    },

    autoReadEnabledAt(key) {
      if (!autoReadKeys.includes(key)) return null;
      return autoReadAt[key] ?? null;
    },
  };
}

let defaultController: SpeechController | null | undefined;

function createDefaultController(): SpeechController | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const synth = window.speechSynthesis as unknown as SpeechSynthesisLike | undefined;
  if (!synth) return null;

  const Utterance = (
    window as unknown as { SpeechSynthesisUtterance?: new (text: string) => UtteranceLike }
  ).SpeechSynthesisUtterance;
  const createUtterance = (text: string): UtteranceLike =>
    Utterance
      ? new Utterance(text)
      : { text, rate: SPEECH_DEFAULT_RATE, voice: null, lang: "", onend: null, onerror: null };

  let storage: StorageLike | undefined;
  try {
    storage = window.localStorage ?? undefined;
  } catch {
    storage = undefined;
  }

  return createSpeechController(synth, createUtterance, storage);
}

/**
 * Lazily created app-wide controller bound to the browser's speech synthesizer.
 * Returns null when the browser has no Web Speech API (or there is no window).
 */
export function getSpeechController(): SpeechController | null {
  if (defaultController === undefined) defaultController = createDefaultController();
  return defaultController;
}

/** Drops the cached default controller so tests can rebind it to a fresh window. */
export function resetSpeechControllerForTests(): void {
  defaultController = undefined;
}
