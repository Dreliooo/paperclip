import { describe, expect, it } from "vitest";
import { preferredRegions, rankVoicesForLanguage, type RankableVoice } from "./voice-ranking";

const voice = (name: string, lang: string, localService = true, extra: Partial<RankableVoice> = {}): RankableVoice => ({
  voiceURI: name,
  name,
  lang,
  localService,
  ...extra,
});

// Voice names as Windows (Edge), Chrome and macOS report them.
const VOICES = [
  voice("Microsoft Helena - Spanish (Spain)", "es-ES"),
  voice("Microsoft Sabina - Spanish (Mexico)", "es-MX"),
  voice("Microsoft Elena Online (Natural) - Spanish (Argentina)", "es-AR", false),
  voice("Google español", "es-ES", false),
  voice("Google español de Estados Unidos", "es-US", false),
  voice("Paulina (Enhanced)", "es-MX"),
  voice("eSpeak Spanish", "es"),
  voice("Microsoft Zira - English (United States)", "en-US"),
];

describe("preferredRegions", () => {
  it("puts the reader's own region first, then nearby regions", () => {
    const regions = preferredRegions("es", ["es-AR", "en-US"]);
    expect(regions[0]).toBe("es-AR");
    expect(regions.indexOf("es-419")).toBeLessThan(regions.indexOf("es-ES"));
  });
});

describe("rankVoicesForLanguage", () => {
  it("prefers natural local voices and never offers online voices without permission", () => {
    const ranked = rankVoicesForLanguage(VOICES, "es", { browserLanguages: ["es-AR"] });
    expect(ranked[0]?.voice.name).toBe("Paulina (Enhanced)");
    expect(ranked.every((entry) => !entry.online)).toBe(true);
    expect(ranked.at(-1)?.voice.name).toBe("eSpeak Spanish");
    expect(ranked.map((entry) => entry.voice.lang)).not.toContain("en-US");
  });

  it("prefers the reader's region among plain voices", () => {
    const ranked = rankVoicesForLanguage(
      [voice("Microsoft Helena - Spanish (Spain)", "es-ES"), voice("Microsoft Sabina - Spanish (Mexico)", "es-MX")],
      "es",
      { browserLanguages: ["es-AR"] },
    );
    expect(ranked[0]?.voice.lang).toBe("es-MX");
  });

  it("puts a natural online voice from the reader's region first once allowed", () => {
    const ranked = rankVoicesForLanguage(VOICES, "es", { allowOnline: true, browserLanguages: ["es-AR"] });
    expect(ranked[0]?.voice.name).toBe("Microsoft Elena Online (Natural) - Spanish (Argentina)");
    expect(ranked[0]).toMatchObject({ natural: true, online: true });
  });

  it("returns nothing for a language without voices", () => {
    expect(rankVoicesForLanguage(VOICES, "fr")).toEqual([]);
  });
});
