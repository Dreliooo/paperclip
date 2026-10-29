/**
 * Picks the best-sounding voice for a language from the browser's list.
 *
 * Browsers expose dozens of voices of very different quality. The first voice
 * that matches a language is often the oldest, most robotic one, and often from
 * another region (Spain for a reader in Argentina). Ranking prefers, in order:
 * natural/neural voices, the reader's own region (from the browser languages),
 * nearby regions, and the system default. Online voices are considered only
 * when the person allowed them, because they send the text to the browser
 * vendor (Microsoft for Edge, Google for Chrome).
 */

export interface RankableVoice {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

export interface RankedVoice<V extends RankableVoice = RankableVoice> {
  voice: V;
  score: number;
  /** Natural, neural or enhanced quality, judged from the vendor's name. */
  natural: boolean;
  online: boolean;
}

const NATURAL_NAME = /\b(natural|neural|premium|enhanced|mejorad[ao]|wavenet|studio|siri)\b/i;
const ROBOTIC_NAME = /\b(espeak|e-speak|compact|festival|mbrola|pico)\b/i;
// Google's online voices in Chrome are far better than most local voices.
const GOOGLE_ONLINE_NAME = /^google\b/i;

/** Regions tried after the reader's own, nearest first. */
const REGION_FALLBACKS: Record<string, string[]> = {
  es: ["es-AR", "es-UY", "es-CL", "es-PY", "es-419", "es-US", "es-MX", "es-CO", "es-PE", "es-VE", "es-ES"],
  en: ["en-US", "en-GB", "en-AU", "en-CA", "en-IE", "en-IN"],
  pt: ["pt-BR", "pt-PT"],
};

export function primaryLanguage(tag: string | null | undefined): string {
  return (tag ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

function normalizeTag(tag: string): string {
  const [primary, region] = tag.replace("_", "-").split("-");
  return region ? `${primary!.toLowerCase()}-${region.toUpperCase()}` : primary!.toLowerCase();
}

/**
 * Regions to prefer for `lang`, nearest first: the reader's browser languages
 * that share the language (e.g. "es-AR"), then fixed neighbours.
 */
export function preferredRegions(lang: string, browserLanguages: readonly string[] = []): string[] {
  const primary = primaryLanguage(lang);
  const own = browserLanguages
    .map(normalizeTag)
    .filter((tag) => primaryLanguage(tag) === primary && tag.includes("-"));
  const explicit = lang.includes("-") || lang.includes("_") ? [normalizeTag(lang)] : [];
  return [...new Set([...explicit, ...own, ...(REGION_FALLBACKS[primary] ?? [])])];
}

/** Voices for the language of `lang`, best first. */
export function rankVoicesForLanguage<V extends RankableVoice>(
  voices: readonly V[],
  lang: string,
  options: { allowOnline?: boolean; browserLanguages?: readonly string[] } = {},
): RankedVoice<V>[] {
  const primary = primaryLanguage(lang);
  if (!primary) return [];
  const regions = preferredRegions(lang, options.browserLanguages);
  return voices
    .filter((voice) => primaryLanguage(voice.lang) === primary)
    .filter((voice) => voice.localService || options.allowOnline)
    .map((voice) => {
      const natural = NATURAL_NAME.test(voice.name);
      const online = !voice.localService;
      const regionIndex = regions.indexOf(normalizeTag(voice.lang));
      let score = 0;
      if (natural) score += 100;
      if (online && GOOGLE_ONLINE_NAME.test(voice.name)) score += 80;
      if (ROBOTIC_NAME.test(voice.name)) score -= 100;
      score += regionIndex === -1 ? 0 : Math.max(5, 40 - regionIndex * 3);
      if (voice.default) score += 2;
      return { voice, score, natural: natural || (online && GOOGLE_ONLINE_NAME.test(voice.name)), online };
    })
    .sort((a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name));
}
