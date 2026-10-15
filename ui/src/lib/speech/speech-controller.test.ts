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

function utteranceAt(synth: ReturnType<typeof createFakeSynth>, index: number): UtteranceLike {
  return synth.speak.mock.calls[index][0] as UtteranceLike;
}

describe("speak", () => {
  it("splits text into chunks and sequences them one at a time", () => {
    const synth = createFakeSynth();
    const controller = createSpeechController(synth, createUtterance);
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
    const controller = createSpeechController(synth, createUtterance);

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
    const controller = createSpeechController(synth, createUtterance);

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
    const controller = createSpeechController(synth, createUtterance);

    controller.enqueue("a", "First.");
    controller.enqueue("b", "Second.");
    utteranceAt(synth, 0).onerror?.();
    expect(synth.speak.mock.calls).toHaveLength(2);
  });
});

describe("stop", () => {
  it("cancels playback, clears the queue and returns to idle", () => {
    const synth = createFakeSynth();
    const controller = createSpeechController(synth, createUtterance);

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
  it("pauses the synthesizer, holds the queue, and resumes", () => {
    const synth = createFakeSynth();
    const controller = createSpeechController(synth, createUtterance);

    controller.speak("a", "First.");
    controller.pause();
    expect(synth.pause.mock.calls).toHaveLength(1);
    expect(controller.getState().status).toBe("paused");

    controller.enqueue("b", "Second.");
    expect(synth.speak.mock.calls).toHaveLength(1);

    controller.resume();
    expect(synth.resume.mock.calls).toHaveLength(1);
    expect(controller.getState().status).toBe("speaking");
    expect(controller.getState().currentId).toBe("a");
  });
});

describe("rate", () => {
  it("clamps the rate to 0.5 to 2 and persists it", () => {
    const storage = createMemoryStorage();
    const controller = createSpeechController(createFakeSynth(), createUtterance, storage);

    controller.setRate(5);
    expect(controller.getState().rate).toBe(2);
    controller.setRate(0.1);
    expect(controller.getState().rate).toBe(0.5);

    const saved = JSON.parse(storage.data.get("paperclip:speech:settings") ?? "null");
    expect(saved).toMatchObject({ rate: 0.5 });

    const reloaded = createSpeechController(createFakeSynth(), createUtterance, storage);
    expect(reloaded.getState().rate).toBe(0.5);
  });

  it("applies the current rate to new utterances", () => {
    const synth = createFakeSynth();
    const controller = createSpeechController(synth, createUtterance);

    controller.setRate(1.5);
    controller.speak("a", "Hi.");
    expect(utteranceAt(synth, 0).rate).toBe(1.5);
  });
});

describe("auto-read", () => {
  it("persists enabled keys and their enable timestamps", () => {
    const storage = createMemoryStorage();
    const controller = createSpeechController(createFakeSynth(), createUtterance, storage);
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

    const reloaded = createSpeechController(createFakeSynth(), createUtterance, storage);
    expect(reloaded.isAutoRead("issue:1")).toBe(true);
    expect(reloaded.autoReadEnabledAt("issue:1")).toBe(enabledAt);
  });

  it("clears the key and its timestamp when disabled", () => {
    const storage = createMemoryStorage();
    const controller = createSpeechController(createFakeSynth(), createUtterance, storage);

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
    const controller = createSpeechController(synth, createUtterance);

    controller.speak("a", "Hola.", { lang: "es-AR" });
    expect(utteranceAt(synth, 0).voice?.voiceURI).toBe("es-local");
    expect(utteranceAt(synth, 0).lang).toBe("es-AR");
  });

  it("uses the saved voice when it is available", () => {
    const synth = createFakeSynth(voices);
    const controller = createSpeechController(synth, createUtterance);

    controller.setVoice("es-remote");
    controller.speak("a", "Hola.", { lang: "es-AR" });
    expect(utteranceAt(synth, 0).voice?.voiceURI).toBe("es-remote");
  });

  it("falls back to the language match when the saved voice is missing", () => {
    const synth = createFakeSynth(voices);
    const controller = createSpeechController(synth, createUtterance);

    controller.setVoice("gone");
    controller.speak("a", "Hello.", { lang: "en" });
    expect(utteranceAt(synth, 0).voice?.voiceURI).toBe("us-local");
  });

  it("never picks an online voice automatically", () => {
    const synth = createFakeSynth([{ voiceURI: "fr-remote", name: "FR", lang: "fr-FR", localService: false }]);
    const controller = createSpeechController(synth, createUtterance);

    controller.speak("a", "Bonjour.", { lang: "fr" });
    expect(utteranceAt(synth, 0).voice).toBeNull();
  });

  it("leaves the system default voice when no language is given", () => {
    const synth = createFakeSynth(voices);
    const controller = createSpeechController(synth, createUtterance);

    controller.speak("a", "Hi.");
    expect(utteranceAt(synth, 0).voice).toBeNull();
    expect(controller.getVoices()).toHaveLength(3);
  });
});
