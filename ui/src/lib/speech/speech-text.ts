/**
 * Pure text helpers for "Listen" (read agent replies aloud). No DOM, no
 * network: they only turn agent markdown into plain sentences a speech
 * synthesizer can read without spelling out markup.
 */

export interface MarkdownToSpeechOptions {
  /** Spoken in place of each fenced code block. Defaults to nothing. */
  codePlaceholder?: string;
}

const DEFAULT_CHUNK_LENGTH = 220;
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

  return line
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();
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
