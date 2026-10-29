/**
 * Pure text helpers for "Listen" (read agent replies aloud). No DOM, no
 * network: they only turn agent markdown into plain sentences a speech
 * synthesizer can read without spelling out markup.
 */

export interface MarkdownToSpeechOptions {
  /** Spoken in place of each fenced code block. Defaults to nothing. */
  codePlaceholder?: string;
}

// Short enough that Chrome's online voices never hit their ~15 second cut-off.
const DEFAULT_CHUNK_LENGTH = 200;
const FENCE_OPEN = /^\s*(`{3,}|~{3,})/;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;
const TABLE_SEPARATOR = /^\|?[\s:|-]*-[\s:|-]*\|?$/;
const HORIZONTAL_RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** Split markdown into prose lines and fenced-code markers, dropping the fence bodies. */
function splitFences(markdown: string): Array<{ code: boolean; line: string }> {
  const parts: Array<{ code: boolean; line: string }> = [];
  let fence: string | null = null;
  for (const line of markdown.split("\n")) {
    if (fence !== null) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      fence = open[1];
      parts.push({ code: true, line: "" });
      continue;
    }
    parts.push({ code: false, line });
  }
  return parts;
}

/** Reduce one prose line (already outside any code fence) to speakable text. */
function speakLine(input: string): string {
  let line = input;

  if (HORIZONTAL_RULE.test(line)) return "";
  const trimmed = line.trim();
  if (trimmed.includes("|") && TABLE_SEPARATOR.test(trimmed)) return "";

  // Block prefixes: blockquote, heading, list bullet / number, task checkbox.
  line = line.replace(/^(\s*>)+\s?/, "");
  line = line.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\s+#+\s*$/, "");
  line = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/^\[[ xX]\]\s+/, "");

  // Inline markup. HTML goes first so its attributes cannot leak into link parsing.
  line = line
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/[^\s<>"'()[\]]*[^\s<>"'()[\].,;:!?]/gi, "")
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "$1")
    .replace(/__(?=\S)([^_\n]*?\S)__/g, "$1")
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1$2")
    .replace(/\*(?=\S)([^*\n]*?\S)\*/g, "$1")
    .replace(/~~(?=\S)([^~\n]*?\S)~~/g, "$1");

  // Table rows: "| a | b |" becomes "a, b".
  if (line.includes("|")) {
    line = line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean)
      .join(", ");
  }

  return normalizeForSpeech(line)
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// Hashes and other machine ids: long runs of hex that contain both letters and digits.
const HEX_ID = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{12,}\b/gi;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
// File paths with a letter and either two slashes or a file extension; "20/10" and "y/o" are left alone.
const PATH = /(^|\s)(?=\S*[A-Za-z])(?:(?:\.{0,2}\/)?(?:[\w.-]+\/){2,}([\w-]+)(?:\.\w+)?|(?:[\w.-]+\/)+([\w-]+)\.\w{1,5})(?=\s|$|[,;:!?)])/g;

/** Group a long digit run so it is read as digits ("22 98 08 03"), not as one huge number. Amounts stay whole. */
function groupDigits(run: string, offset: number, text: string): string {
  if (/(\$|\b(?:usd|ars|eur|u\$s)\s?)\s*$/i.test(text.slice(Math.max(0, offset - 6), offset))) return run;
  const groups: string[] = [];
  for (let index = 0; index < run.length; index += 2) groups.push(run.slice(index, index + 2));
  return groups.join(" ");
}

/**
 * Rewrite things synthesizers read badly: machine ids and emoji are dropped,
 * ISO dates become day/month/year, hyphens between digits (CUIT, phone numbers)
 * stop being read as "minus", long digit runs are read in pairs, arrows become
 * pauses, file paths keep their last name, and "@" before a name is silent.
 */
export function normalizeForSpeech(text: string): string {
  return text
    .replace(UUID, "")
    .replace(HEX_ID, "")
    .replace(PATH, (_match, lead: string, deep?: string, file?: string) => `${lead}${deep ?? file ?? ""}`)
    .replace(ISO_DATE, "$3/$2/$1")
    .replace(/(\d)-(?=\d)/g, "$1 ")
    .replace(/\b\d{7,}\b/g, groupDigits)
    .replace(/\s*(?:->|=>|→|⇒|➜)\s*/g, ", ")
    .replace(/(^|[\s(])@(?=\p{L})/gu, "$1")
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}

const LANGUAGE_HINTS: Record<string, RegExp> = {
  es: /\b(el|la|los|las|que|de|del|para|por|con|una|es|está|están|pero|como|más|también|tarea|hay|fue|son|ya|sin)\b/gi,
  en: /\b(the|and|is|are|to|of|for|with|that|this|was|be|have|it|not|on|you|will|task|from)\b/gi,
  pt: /\b(não|você|está|são|uma|para|com|também|isso|então|pelo|pela|ao|aos|foi)\b/gi,
};

/**
 * Best guess of the language a reply is written in ("es", "en" or "pt"), so
 * an English reply is not read with a Spanish voice. Falls back to `fallback`
 * (the interface language) when the text is too short or ambiguous.
 */
export function detectSpeechLanguage(text: string, fallback: string): string {
  const counts = Object.entries(LANGUAGE_HINTS).map(([lang, pattern]) => [lang, text.match(pattern)?.length ?? 0] as const);
  counts.sort((a, b) => b[1] - a[1]);
  const [best, second] = counts;
  if (!best || best[1] < 3 || best[1] < (second?.[1] ?? 0) * 1.5) return fallback;
  const fallbackPrimary = fallback.toLowerCase().split(/[-_]/)[0];
  // Keep the interface's regional tag (es-AR) when the detected language matches it.
  return best[0] === fallbackPrimary ? fallback : best[0];
}

/**
 * Convert agent markdown into plain speakable text. Fenced code is replaced by
 * `options.codePlaceholder` (one line), links keep their label, images, bare
 * URLs and HTML tags are dropped, and list/heading/quote markers and emphasis
 * markers are removed. Table separator rows are dropped and cell pipes become
 * commas. Lines are kept as separators so the chunker can split on them.
 */
export function markdownToSpeechText(
  markdown: string,
  options: MarkdownToSpeechOptions = {},
): string {
  const placeholder = options.codePlaceholder ?? "";
  const lines = splitFences(markdown.replace(/\r\n?/g, "\n")).map((part) =>
    part.code ? placeholder : speakLine(part.line),
  );
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Hard-split a single over-long sentence at the last space before `max`, or at `max` for a long word. */
function splitLongSentence(sentence: string, max: number): { head: string[]; rest: string } {
  const head: string[] = [];
  let rest = sentence;
  while (rest.length > max) {
    const space = rest.lastIndexOf(" ", max);
    const cut = space > 0 ? space : max;
    const piece = rest.slice(0, cut).trim();
    if (piece) head.push(piece);
    rest = rest.slice(cut).trim();
  }
  return { head, rest };
}

/**
 * Split speakable text into chunks of at most `maxLength` characters, breaking
 * at sentence boundaries (. ! ? … ; and newlines). Adjacent short sentences are
 * packed together. A sentence longer than the limit is split at the last space
 * before the limit (or mid-word when there is no space). Never returns empty
 * strings.
 */
export function splitIntoSpeechChunks(text: string, maxLength = DEFAULT_CHUNK_LENGTH): string[] {
  const max = Math.max(1, Math.floor(maxLength));
  // Mark sentence ends with a newline instead of a lookbehind, which older Safari cannot parse.
  const sentences = text
    .replace(/([.!?…;]+)\s+/g, "$1\n")
    .split("\n")
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const sentence of sentences) {
    if (sentence.length > max) {
      flush();
      const { head, rest } = splitLongSentence(sentence, max);
      chunks.push(...head);
      current = rest;
      continue;
    }
    if (!current) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= max) {
      current = `${current} ${sentence}`;
    } else {
      flush();
      current = sentence;
    }
  }
  flush();
  return chunks;
}
