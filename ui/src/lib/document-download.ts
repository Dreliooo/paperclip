/**
 * File name for a downloaded task document. Prefers the readable title the
 * reader sees ("Plan de migración" → "plan-de-migracion.md") and falls back to
 * the document key, so a download never produces an empty or unsafe name.
 */
export function documentFileName(title: string | null | undefined, key: string): string {
  const slug = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "");
  return `${slug(title ?? "") || slug(key) || "document"}.md`;
}

/** Saves Markdown text as a file through the browser's normal download flow. */
export function downloadMarkdownFile(fileName: string, body: string) {
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
