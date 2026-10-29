// @vitest-environment jsdom

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetSpeechControllerForTests } from "@/lib/speech/speech-controller";
import { ListenButton } from "./ListenButton";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function act<T>(cb: () => T): T {
  let result: T | undefined;
  flushSync(() => {
    result = cb();
  });
  return result as T;
}

class FakeUtterance {
  text: string;
  rate = 1;
  voice: unknown = null;
  lang = "";
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

function installSpeechSynthesis() {
  const synth = {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, writable: true, value: synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: FakeUtterance,
  });
  return synth;
}

function removeSpeechSynthesis() {
  const target = window as unknown as Record<string, unknown>;
  delete target.speechSynthesis;
  delete target.SpeechSynthesisUtterance;
}

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;

function render(element: ReactElement): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(element));
  return container;
}

function clickFirstButton(host: HTMLDivElement) {
  const button = host.querySelector("button");
  act(() => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  resetSpeechControllerForTests();
  removeSpeechSynthesis();
});

describe("ListenButton", () => {
  it("reads the stripped reply aloud once when Listen is clicked", () => {
    const synth = installSpeechSynthesis();
    resetSpeechControllerForTests();

    const host = render(
      <ListenButton id="msg-1" text={"**Hello** [docs](https://example.com) there."} />,
    );
    clickFirstButton(host);

    expect(synth.speak.mock.calls).toHaveLength(1);
    const utterance = synth.speak.mock.calls[0][0] as { text: string };
    expect(utterance.text).toBe("Hello docs there.");
  });

  it("pauses the reply when the same button is clicked while it is speaking", () => {
    const synth = installSpeechSynthesis();
    resetSpeechControllerForTests();

    const host = render(<ListenButton id="msg-2" text="Hello there." />);
    clickFirstButton(host);
    clickFirstButton(host);

    expect(synth.speak.mock.calls).toHaveLength(1);
    // Pause stops the voice and remembers the sentence; it does not rely on the browser's pause.
    expect(synth.cancel.mock.calls.length).toBeGreaterThan(0);
    expect(synth.pause.mock.calls).toHaveLength(0);

    clickFirstButton(host);
    expect(synth.speak.mock.calls).toHaveLength(2);
    expect((synth.speak.mock.calls[1][0] as { text: string }).text).toBe("Hello there.");
  });

  it("offers reading settings while it is reading", () => {
    installSpeechSynthesis();
    resetSpeechControllerForTests();

    const host = render(<ListenButton id="msg-4" text="Hello there." />);
    clickFirstButton(host);
    expect(host.querySelector('button[aria-label="Reading settings"]')).not.toBeNull();
  });

  it("renders nothing when speech synthesis is unavailable", () => {
    removeSpeechSynthesis();
    resetSpeechControllerForTests();

    const host = render(<ListenButton id="msg-3" text="Hello there." />);
    expect(host.querySelector("button")).toBeNull();
    expect(host.innerHTML).toBe("");
  });
});
