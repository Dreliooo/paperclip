/**
 * One-line preview of a markdown message for compact rows (queued messages).
 * Mentions and links keep only their visible label, so
 * `[@Maestra](agent://…)` reads "@Maestra" instead of exposing the link.
 */
export function messagePreviewText(body: string): string {
  return body
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)\s]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
