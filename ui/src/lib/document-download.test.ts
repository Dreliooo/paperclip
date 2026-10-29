import { describe, expect, it } from "vitest";
import { documentFileName } from "./document-download";

describe("documentFileName", () => {
  it("uses a readable, accent-free slug of the title", () => {
    expect(documentFileName("Plan de migración: fase 1/2", "plan")).toBe("plan-de-migracion-fase-1-2.md");
  });

  it("falls back to the key, then to a generic name", () => {
    expect(documentFileName(null, "plan")).toBe("plan.md");
    expect(documentFileName("   ", "release_notes")).toBe("release-notes.md");
    expect(documentFileName("¿?", "!!")).toBe("document.md");
  });

  it("keeps long titles to a bounded file name", () => {
    const name = documentFileName("a".repeat(200), "plan");
    expect(name).toBe(`${"a".repeat(80)}.md`);
  });
});
