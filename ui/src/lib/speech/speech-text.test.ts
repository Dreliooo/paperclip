import { describe, expect, it } from "vitest";
import { detectSpeechLanguage, markdownToSpeechText, normalizeForSpeech, splitIntoSpeechChunks } from "./speech-text";

describe("markdownToSpeechText", () => {
  it("replaces fenced code blocks with the placeholder as their own line", () => {
    const markdown = "Here it is:\n```ts\nconst a = 1;\n```\nDone.";
    expect(markdownToSpeechText(markdown, { codePlaceholder: "Code omitted." })).toBe(
      "Here it is:\nCode omitted.\nDone.",
    );
  });

  it("drops fenced code entirely when no placeholder is given", () => {
    expect(markdownToSpeechText("Before\n~~~\nx = 2\n~~~\nAfter")).toBe("Before\nAfter");
  });

  it("keeps the text of inline code", () => {
    expect(markdownToSpeechText("Run `npm test` now.")).toBe("Run npm test now.");
  });

  it("keeps link labels and removes images", () => {
    const markdown = "See [the docs](https://example.com/docs) and ![logo](https://x.io/logo.png).";
    expect(markdownToSpeechText(markdown)).toBe("See the docs and.");
  });

  it("removes bare http and https URLs but keeps trailing punctuation", () => {
    expect(markdownToSpeechText("Details at https://example.com/a?b=1, thanks.")).toBe(
      "Details at, thanks.",
    );
  });

  it("removes heading, quote and list markers", () => {
    expect(markdownToSpeechText("# Title\n- one\n* two\n1. three\n> quoted")).toBe(
      "Title\none\ntwo\nthree\nquoted",
    );
  });

  it("removes bold and italic markers used as emphasis", () => {
    expect(markdownToSpeechText("This is **very** *really* __bold__ and _soft_ text.")).toBe(
      "This is very really bold and soft text.",
    );
  });

  it("leaves underscores inside words alone", () => {
    expect(markdownToSpeechText("Use snake_case_name here.")).toBe("Use snake_case_name here.");
  });

  it("drops table separator rows and turns cell pipes into commas", () => {
    const markdown = "| Name | Role |\n|---|---|\n| Ana | Lead |";
    expect(markdownToSpeechText(markdown)).toBe("Name, Role\nAna, Lead");
  });

  it("removes HTML tags", () => {
    expect(markdownToSpeechText("<p>Hello <strong>world</strong></p><br>Bye")).toBe(
      "Hello world Bye",
    );
  });

  it("collapses whitespace and blank lines", () => {
    expect(markdownToSpeechText("  Lots   of\t\tspace  \n\n\n\nNext  ")).toBe(
      "Lots of space\nNext",
    );
  });

  it("returns an empty string for empty input", () => {
    expect(markdownToSpeechText("")).toBe("");
  });
});

describe("splitIntoSpeechChunks", () => {
  it("packs short sentences into one chunk", () => {
    expect(splitIntoSpeechChunks("One. Two. Three.")).toEqual(["One. Two. Three."]);
  });

  it("respects the length limit by starting a new chunk", () => {
    const sentence = (letter: string) => `${letter.repeat(99)}.`;
    const chunks = splitIntoSpeechChunks([sentence("a"), sentence("b"), sentence("c")].join(" "));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThan(221);
    }
  });

  it("splits on newlines between long lines", () => {
    const chunks = splitIntoSpeechChunks(`${"a".repeat(150)}\n${"b".repeat(150)}`);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe("a".repeat(150));
  });

  it("never returns empty chunks", () => {
    const chunks = splitIntoSpeechChunks("  .  \n\n  Hello.  ");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => chunk.trim().length > 0)).toBe(true);
  });

  it("returns no chunks for empty text", () => {
    expect(splitIntoSpeechChunks("")).toEqual([]);
  });

  it("hard-splits a single word longer than the limit", () => {
    const chunks = splitIntoSpeechChunks("x".repeat(500), 200);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].length).toBe(200);
    expect(chunks[1].length).toBe(200);
    expect(chunks[2].length).toBe(100);
  });

  it("splits a long sentence at the last space before the limit", () => {
    const text = Array.from({ length: 80 }, () => "word").join(" ");
    const chunks = splitIntoSpeechChunks(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThan(101);
      expect(chunk.split(" ").every((part) => part === "word")).toBe(true);
    }
  });
});

describe("normalizeForSpeech", () => {
  it("reads tax ids and long numbers in pairs, and keeps amounts whole", () => {
    expect(normalizeForSpeech("CUIT 20-22980803-7")).toBe("CUIT 20 22 98 08 03 7");
    expect(normalizeForSpeech("CUIT 20229808037")).toBe("CUIT 20 22 98 08 03 7");
    expect(normalizeForSpeech("Total $1500000")).toBe("Total $1500000");
  });

  it("turns ISO dates into day/month/year and leaves short dates alone", () => {
    expect(normalizeForSpeech("Vence el 2026-10-20 y el 20/10")).toBe("Vence el 20/10/2026 y el 20/10");
  });

  it("drops machine ids and emoji, and silences mention signs and arrows", () => {
    expect(normalizeForSpeech("Pasalo a @Maestra Dolores 🚀 (86fbfeeb-0eed-4d4e-b31b-a2c4d5e6f7a8) -> listo"))
      .toBe("Pasalo a Maestra Dolores, listo");
    expect(normalizeForSpeech("commit 98ebf98dd3e051ee788")).toBe("commit ");
  });

  it("keeps only the file name of a path, but not of y/o", () => {
    expect(normalizeForSpeech("Revisá server/src/services/issues.ts y/o docs/plan.md")).toBe("Revisá issues y/o plan");
  });
});

describe("detectSpeechLanguage", () => {
  it("detects an English reply in a Spanish interface", () => {
    expect(detectSpeechLanguage("The task is done and the report was sent to the client.", "es-AR")).toBe("en");
  });

  it("keeps the interface tag for Spanish text and for short or unclear text", () => {
    expect(detectSpeechLanguage("La tarea quedó lista y el informe ya está en la carpeta del cliente.", "es-AR")).toBe("es-AR");
    expect(detectSpeechLanguage("OK", "es-AR")).toBe("es-AR");
  });
});
