import { describe, expect, it, vi } from "vitest";
import {
  createSpeechController,
  type UtteranceLike,
  type VoiceLike,
} from "./speech-controller";

function createFakeSynth(voices: VoiceLike[] = []) {
  return {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => voices,
  };
}

function createUtterance(text: string): UtteranceLike {
  return { text, rate: 1, voice: null, lang: "", onend: null, onerror: null };
}

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

/** Timers are captured, never run on their own; `fire` runs the latest watchdog. */
function testOptions(browserLanguages: string[] = ["es-AR"]) {
  const timers: Array<{ callback: () => void; cleared: boolean }> = [];
  return {
    browserLanguages,
    timers,
    setTimer: (callback: () => void) => {
      const timer = { callback, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle: unknown) => {
      (handle as { cleared: boolean }).cleared = true;
    },
  };
}

function utteranceAt(synth: ReturnType<typeof createFakeSynth>, index: number): UtteranceLike {
  return synth.speak.mock.calls[index][0] as UtteranceLike;
}

describe("speak", () => {
  it("splits text into chunks and sequences them one at a time", () => {
    const synth = createFakeSynth();
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());
    const sentence = (letter: string) => `${letter.repeat(150)}.`;

    controller.speak("msg-1", `${sentence("a")} ${sentence("b")}`);
    expect(synth.speak.mock.calls).toHaveLength(1);
    expect(utteranceAt(synth, 0).text).toBe(sentence("a"));

    utteranceAt(synth, 0).onend?.();
    expect(synth.speak.mock.calls).toHaveLength(2);
    expect(utteranceAt(synth, 1).text).toBe(sentence("b"));

    utteranceAt(synth, 1).onend?.();
    expect(synth.speak.mock.calls).toHaveLength(2);
    expect(controller.getState().status).toBe("idle");
    expect(controller.getState().currentId).toBeNull();
  });

  it("interrupts playback and clears the queue, ignoring stale callbacks", () => {
    const synth = createFakeSynth();
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());

    controller.speak("a", "Alpha.");
    controller.enqueue("b", "Beta.");
    controller.speak("c", "Gamma.");
    expect(synth.cancel.mock.calls.length).toBeGreaterThan(0);
    expect(controller.getState().currentId).toBe("c");
    expect(controller.getState().queueLength).toBe(0);

    // A cancelled utterance may still report its end; it must not start "Beta".
    utteranceAt(synth, 0).onend?.();
    expect(synth.speak.mock.calls).toHaveLength(2);
    expect(utteranceAt(synth, 1).text).toBe("Gamma.");
  });
});

describe("enqueue", () => {
  it("never overlaps: only one utterance reaches the synthesizer at a time", () => {
    const synth = createFakeSynth();
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());

    controller.enqueue("a", "First.");
    controller.enqueue("b", "Second.");
    expect(synth.speak.mock.calls).toHaveLength(1);
    expect(controller.getState().queueLength).toBe(1);

    utteranceAt(synth, 0).onend?.();
    expect(synth.speak.mock.calls).toHaveLength(2);
    expect(utteranceAt(synth, 1).text).toBe("Second.");
    expect(controller.getState().currentId).toBe("b");

    utteranceAt(synth, 1).onend?.();
    expect(controller.getState().status).toBe("idle");
  });

  it("advances to the next chunk when an utterance errors", () => {
    const synth = createFakeSynth();
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());

    controller.enqueue("a", "First.");
    controller.enqueue("b", "Second.");
    utteranceAt(synth, 0).onerror?.();
    expect(synth.speak.mock.calls).toHaveLength(2);
  });
});

describe("stop", () => {
  it("cancels playback, clears the queue and returns to idle", () => {
    const synth = createFakeSynth();
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());

    controller.enqueue("a", "First.");
    controller.enqueue("b", "Second.");
    controller.stop();

    expect(synth.cancel.mock.calls).toHaveLength(1);
    expect(controller.getState().status).toBe("idle");
    expect(controller.getState().queueLength).toBe(0);
    expect(controller.getState().currentId).toBeNull();

    utteranceAt(synth, 0).onend?.();
    expect(synth.speak.mock.calls).toHaveLength(1);
  });
});

describe("pause and resume", () => {
  it("stops on pause, holds the queue, and replays the interrupted sentence on resume", () => {
    const synth = createFakeSynth();
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());

    controller.speak("a", "First.");
    const first = utteranceAt(synth, 0);
    controller.pause();
    expect(synth.cancel.mock.calls.length).toBeGreaterThan(0);
    expect(synth.pause.mock.calls).toHaveLength(0);
    expect(controller.getState().status).toBe("paused");
    // The cancelled utterance reporting its end must not advance the queue.
    first.onend?.();

    controller.enqueue("b", "Second.");
    expect(synth.speak.mock.calls).toHaveLength(1);

    controller.resume();
    expect(controller.getState().status).toBe("speaking");
    expect(controller.getState().currentId).toBe("a");
    expect(utteranceAt(synth, 1).text).toBe("First.");
    utteranceAt(synth, 1).onend?.();
    expect(utteranceAt(synth, 2).text).toBe("Second.");
  });
});

describe("watchdog", () => {
  it("moves on when the browser never reports the end of a sentence, only once", () => {
    const synth = createFakeSynth();
    const options = testOptions();
    const controller = createSpeechController(synth, createUtterance, undefined, options);

    controller.speak("a", "First. ".repeat(40) + "Second sentence here.", { lang: "en" });
    const chunks = synth.speak.mock.calls.length;
    expect(chunks).toBe(1);
    options.timers.at(-1)!.callback();
    expect(synth.speak.mock.calls).toHaveLength(2);
    // A late end event from the first sentence is ignored.
    utteranceAt(synth, 0).onend?.();
    expect(synth.speak.mock.calls).toHaveLength(2);
  });
});

describe("rate", () => {
  it("clamps the rate to 0.5 to 2 and persists it", () => {
    const storage = createMemoryStorage();
    const controller = createSpeechController(createFakeSynth(), createUtterance, storage, testOptions());

    controller.setRate(5);
    expect(controller.getState().rate).toBe(2);
    controller.setRate(0.1);
    expect(controller.getState().rate).toBe(0.5);

    const saved = JSON.parse(storage.data.get("paperclip:speech:settings") ?? "null");
    expect(saved).toMatchObject({ rate: 0.5 });

    const reloaded = createSpeechController(createFakeSynth(), createUtterance, storage, testOptions());
    expect(reloaded.getState().rate).toBe(0.5);
  });

  it("applies the current rate to new utterances", () => {
    const synth = createFakeSynth();
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());

    controller.setRate(1.5);
    controller.speak("a", "Hi.");
    expect(utteranceAt(synth, 0).rate).toBe(1.5);
  });
});

describe("auto-read", () => {
  it("persists enabled keys and their enable timestamps", () => {
    const storage = createMemoryStorage();
    const controller = createSpeechController(createFakeSynth(), createUtterance, storage, testOptions());
    expect(controller.isAutoRead("issue:1")).toBe(false);
    expect(controller.autoReadEnabledAt("issue:1")).toBeNull();

    const before = Date.now();
    controller.setAutoRead("issue:1", true);
    const enabledAt = controller.autoReadEnabledAt("issue:1");
    expect(controller.isAutoRead("issue:1")).toBe(true);
    expect(enabledAt).toBeTruthy();
    expect(enabledAt as number).toBeGreaterThan(before - 1);

    // Re-enabling keeps the original timestamp so older replies stay unread.
    controller.setAutoRead("issue:1", true);
    expect(controller.autoReadEnabledAt("issue:1")).toBe(enabledAt);

    expect(storage.data.get("paperclip:speech:auto-read")).toBe(JSON.stringify(["issue:1"]));

    const reloaded = createSpeechController(createFakeSynth(), createUtterance, storage, testOptions());
    expect(reloaded.isAutoRead("issue:1")).toBe(true);
    expect(reloaded.autoReadEnabledAt("issue:1")).toBe(enabledAt);
  });

  it("clears the key and its timestamp when disabled", () => {
    const storage = createMemoryStorage();
    const controller = createSpeechController(createFakeSynth(), createUtterance, storage, testOptions());

    controller.setAutoRead("agent:2", true);
    controller.setAutoRead("agent:2", false);
    expect(controller.isAutoRead("agent:2")).toBe(false);
    expect(controller.autoReadEnabledAt("agent:2")).toBeNull();
    expect(storage.data.get("paperclip:speech:auto-read")).toBe("[]");
  });
});

describe("voice selection", () => {
  const voices: VoiceLike[] = [
    { voiceURI: "us-local", name: "US", lang: "en-US", localService: true },
    { voiceURI: "es-remote", name: "ES remote", lang: "es-ES", localService: false },
    { voiceURI: "es-local", name: "ES local", lang: "es-MX", localService: true },
  ];

  it("prefers a voice matching the language's primary subtag, and a local one among matches", () => {
    const synth = createFakeSynth(voices);
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());

    controller.speak("a", "Hola.", { lang: "es-AR" });
    expect(utteranceAt(synth, 0).voice?.voiceURI).toBe("es-local");
    expect(utteranceAt(synth, 0).lang).toBe("es-MX");
  });

  it("uses the saved voice when it is available", () => {
    const synth = createFakeSynth(voices);
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());

    controller.setVoice("es", "es-remote");
    controller.speak("a", "Hola.", { lang: "es-AR" });
    expect(utteranceAt(synth, 0).voice?.voiceURI).toBe("es-remote");
  });

  it("falls back to the language match when the saved voice is missing", () => {
    const synth = createFakeSynth(voices);
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());

    controller.setVoice("en", "gone");
    controller.speak("a", "Hello.", { lang: "en" });
    expect(utteranceAt(synth, 0).voice?.voiceURI).toBe("us-local");
  });

  it("never picks an online voice automatically", () => {
    const synth = createFakeSynth([{ voiceURI: "fr-remote", name: "FR", lang: "fr-FR", localService: false }]);
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());

    controller.speak("a", "Bonjour.", { lang: "fr" });
    expect(utteranceAt(synth, 0).voice).toBeNull();
  });

  it("reads an English reply with an English voice in a Spanish interface", () => {
    const synth = createFakeSynth(voices);
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());

    controller.speak("a", "The task is done and the report was sent to the client.", { lang: "es-AR" });
    expect(utteranceAt(synth, 0).voice?.voiceURI).toBe("us-local");
    expect(controller.getState().currentLang).toBe("en");
  });

  it("uses online voices only after they are allowed, and forgets a chosen one when disallowed", () => {
    const storage = createMemoryStorage();
    const synth = createFakeSynth([
      { voiceURI: "es-local", name: "ES local", lang: "es-MX", localService: true },
      { voiceURI: "ar-natural", name: "Microsoft Elena Online (Natural) - Spanish (Argentina)", lang: "es-AR", localService: false },
    ]);
    const controller = createSpeechController(synth, createUtterance, storage, testOptions());

    controller.speak("a", "Hola.", { lang: "es-AR" });
    expect(utteranceAt(synth, 0).voice?.voiceURI).toBe("es-local");

    controller.setAllowOnlineVoices(true);
    controller.speak("b", "Hola.", { lang: "es-AR" });
    expect(utteranceAt(synth, 1).voice?.voiceURI).toBe("ar-natural");
    expect(JSON.parse(storage.data.get("paperclip:speech:settings")!)).toMatchObject({ allowOnlineVoices: true });

    controller.setVoice("es", "ar-natural");
    controller.setAllowOnlineVoices(false);
    expect(controller.getState().voiceByLang).toEqual({});
    controller.speak("c", "Hola.", { lang: "es-AR" });
    expect(utteranceAt(synth, 2).voice?.voiceURI).toBe("es-local");
  });

  it("keeps a voice chosen before choices were per language for its own language only", () => {
    const storage = createMemoryStorage();
    storage.setItem("paperclip:speech:settings", JSON.stringify({ rate: 1, voiceURI: "es-remote" }));
    const synth = createFakeSynth(voices);
    const controller = createSpeechController(synth, createUtterance, storage, testOptions());

    controller.speak("a", "Hola.", { lang: "es" });
    expect(utteranceAt(synth, 0).voice?.voiceURI).toBe("es-remote");
    controller.speak("b", "Hello.", { lang: "en" });
    expect(utteranceAt(synth, 1).voice?.voiceURI).toBe("us-local");
  });

  it("leaves the system default voice when no language is given", () => {
    const synth = createFakeSynth(voices);
    const controller = createSpeechController(synth, createUtterance, undefined, testOptions());

    controller.speak("a", "Hi.");
    expect(utteranceAt(synth, 0).voice).toBeNull();
    expect(controller.getVoices()).toHaveLength(3);
  });
});
