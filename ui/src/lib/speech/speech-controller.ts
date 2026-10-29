import { detectSpeechLanguage, splitIntoSpeechChunks } from "./speech-text";
import { preferredRegions, primaryLanguage, rankVoicesForLanguage, type RankedVoice } from "./voice-ranking";

/**
 * Framework-agnostic controller for "Listen". It drives one speech synthesizer
 * with at most one utterance in flight: queued text is split into chunks and
 * each chunk is handed to the synthesizer only after the previous one ended.
 * Voices come from the browser. By default only on-device voices are used;
 * online voices (which send the text to the browser vendor) are used only after
 * the person allows them.
 *
 * Pause is implemented as "stop and replay the current sentence": native
 * pause/resume is unreliable (Chrome often never resumes, and some voices
 * ignore it). A watchdog advances when a browser never reports the end of an
 * utterance, which otherwise stalls the whole queue.
 */

export type SpeechStatus = "idle" | "speaking" | "paused";

export interface SpeechState {
  status: SpeechStatus;
  /** Message id currently being read (or paused). */
  currentId: string | null;
  /** Chunks waiting behind the one in flight. */
  queueLength: number;
  rate: number;
  /** Chosen voice per primary language ("es", "en"); missing means automatic. */
  voiceByLang: Record<string, string>;
  /** Online voices may be used (the text goes to the browser vendor). */
  allowOnlineVoices: boolean;
  /** Language of what is being read, e.g. "es-AR". */
  currentLang: string | null;
}

export interface VoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
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
  /** Interface language, e.g. "es-AR". The text's own language wins when it is clear. */
  lang?: string;
  /** Read with this voice regardless of the saved choice (voice preview). */
  voiceURI?: string;
}

export interface SpeechControllerOptions {
  /** Reader's languages, best first (navigator.languages). Used to prefer their region. */
  browserLanguages?: readonly string[];
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
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
  /** Persisted per language. `null` returns to the automatic best voice. */
  setVoice(lang: string, voiceURI: string | null): void;
  /** Persisted. Off by default because online voices send the text to the browser vendor. */
  setAllowOnlineVoices(allowed: boolean): void;
  getVoices(): VoiceLike[];
  /** Usable voices for a language, best first, honoring the online setting. */
  rankedVoices(lang: string): RankedVoice<VoiceLike>[];
  /** The voice that would read `lang` now. */
  voiceFor(lang: string): VoiceLike | null;
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
  voiceURI?: string;
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return SPEECH_DEFAULT_RATE;
  return Math.min(SPEECH_MAX_RATE, Math.max(SPEECH_MIN_RATE, rate));
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

function loadVoiceByLang(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [lang, uri] of Object.entries(value)) {
    if (typeof uri === "string" && uri) result[lang] = uri;
  }
  return result;
}

export function createSpeechController(
  synth: SpeechSynthesisLike,
  createUtterance: (text: string) => UtteranceLike,
  storage?: StorageLike,
  options: SpeechControllerOptions = {},
): SpeechController {
  const savedSettings = readJson(storage, SPEECH_SETTINGS_STORAGE_KEY) as
    | { rate?: unknown; voiceURI?: unknown; voiceByLang?: unknown; allowOnlineVoices?: unknown }
    | null;
  let rate =
    savedSettings && typeof savedSettings.rate === "number"
      ? clampRate(savedSettings.rate)
      : SPEECH_DEFAULT_RATE;
  const voiceByLang = loadVoiceByLang(savedSettings?.voiceByLang);
  // A voice chosen before choices were kept per language still applies to its own language.
  const legacyVoiceURI =
    savedSettings && typeof savedSettings.voiceURI === "string" && savedSettings.voiceURI
      ? savedSettings.voiceURI
      : null;
  let allowOnlineVoices = savedSettings?.allowOnlineVoices === true;
  const browserLanguages = options.browserLanguages ?? [];
  const setTimer = options.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  const autoReadKeys = loadAutoReadKeys(storage);
  const autoReadAt = loadAutoReadAt(storage);

  let queue: QueuedChunk[] = [];
  let status: SpeechStatus = "idle";
  let currentId: string | null = null;
  let current: QueuedChunk | null = null;
  let watchdog: unknown = null;
  // Bumped whenever playback is reset so callbacks from cancelled utterances are ignored.
  let generation = 0;
  let inFlight = false;
  const listeners = new Set<SpeechListener>();

  function buildSnapshot(): SpeechState {
    return {
      status,
      currentId,
      queueLength: queue.length,
      rate,
      voiceByLang: { ...voiceByLang },
      allowOnlineVoices,
      currentLang: current?.lang ?? null,
    };
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

  function rankedVoices(lang: string): RankedVoice<VoiceLike>[] {
    return rankVoicesForLanguage(getVoices(), lang, { allowOnline: allowOnlineVoices, browserLanguages });
  }

  function pickVoice(lang: string | undefined, explicitURI?: string): VoiceLike | null {
    const voices = getVoices();
    if (explicitURI) {
      const chosen = voices.find((voice) => voice.voiceURI === explicitURI);
      if (chosen) return chosen;
    }
    const primary = primaryLanguage(lang);
    if (!primary) return null;
    const sameLanguage = (uri: string | null | undefined) =>
      uri ? voices.find((voice) => voice.voiceURI === uri && primaryLanguage(voice.lang) === primary) ?? null : null;
    // A voice the person chose is honored even when it is online: choosing it is the consent.
    return sameLanguage(voiceByLang[primary]) ?? sameLanguage(legacyVoiceURI) ?? rankedVoices(primary)[0]?.voice ?? null;
  }

  function clearWatchdog(): void {
    if (watchdog !== null) clearTimer(watchdog);
    watchdog = null;
  }

  /** Cancels whatever is playing and empties the queue. */
  function resetPlayback(): void {
    generation += 1;
    clearWatchdog();
    queue = [];
    inFlight = false;
    status = "idle";
    currentId = null;
    current = null;
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
    current = next;
    const gen = generation;
    const utterance = createUtterance(next.text);
    const voice = pickVoice(next.lang, next.voiceURI);
    utterance.rate = rate;
    utterance.voice = voice;
    utterance.lang = voice?.lang ?? (next.lang ? preferredRegions(next.lang, browserLanguages)[0] ?? next.lang : "");
    let done = false;
    const finish = () => {
      if (done || gen !== generation) return;
      done = true;
      clearWatchdog();
      inFlight = false;
      current = null;
      startNext();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
    // Generous upper bound for this sentence; only a browser that never reports the end hits it.
    watchdog = setTimer(finish, 8000 + (next.text.length * 120) / rate);
    emit();
  }

  function chunksFor(id: string, text: string, opts?: SpeakOptions): QueuedChunk[] {
    const lang = opts?.lang ? detectSpeechLanguage(text, opts.lang) : undefined;
    return splitIntoSpeechChunks(text).map((chunk) => ({ id, text: chunk, lang, voiceURI: opts?.voiceURI }));
  }

  function persistSettings(): void {
    writeJson(storage, SPEECH_SETTINGS_STORAGE_KEY, { rate, voiceByLang, allowOnlineVoices, voiceURI: legacyVoiceURI });
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
      // Stop now and replay the interrupted sentence on resume.
      generation += 1;
      clearWatchdog();
      if (current) queue.unshift(current);
      current = null;
      inFlight = false;
      status = "paused";
      synth.cancel();
      emit();
    },

    resume() {
      if (status !== "paused") return;
      status = "idle";
      startNext();
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

    setVoice(lang, next) {
      const primary = primaryLanguage(lang);
      if (!primary) return;
      if (next) voiceByLang[primary] = next;
      else delete voiceByLang[primary];
      persistSettings();
      emit();
    },

    setAllowOnlineVoices(allowed) {
      allowOnlineVoices = allowed;
      // Turning online voices off also drops any online voice chosen earlier.
      if (!allowed) {
        const online = new Set(getVoices().filter((voice) => !voice.localService).map((voice) => voice.voiceURI));
        for (const [lang, uri] of Object.entries(voiceByLang)) if (online.has(uri)) delete voiceByLang[lang];
      }
      persistSettings();
      emit();
    },

    getVoices,
    rankedVoices,

    voiceFor(lang) {
      return pickVoice(lang);
    },

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

  const browserLanguages = typeof navigator !== "undefined"
    ? [...(navigator.languages ?? []), navigator.language].filter((tag): tag is string => Boolean(tag))
    : [];
  return createSpeechController(synth, createUtterance, storage, { browserLanguages });
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
