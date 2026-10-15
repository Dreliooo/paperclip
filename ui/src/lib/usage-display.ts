import type { UsageDisplayMode, UsageTokenBreakdown } from "@paperclipai/shared";

/** Locale-aware compact token count ("1.2M", "1,2 M"). */
export function formatTokenCount(value: number, locale: string): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}

/** US dollars from cents; sub-cent amounts keep two significant digits. */
export function formatUsdCents(cents: number, locale: string): string {
  const dollars = cents / 100;
  const small = Math.abs(dollars) > 0 && Math.abs(dollars) < 0.01;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    ...(small ? { maximumSignificantDigits: 2 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }).format(dollars);
}

export function showsTokens(mode: UsageDisplayMode): boolean {
  return mode !== "costs";
}

export function showsMoney(mode: UsageDisplayMode): boolean {
  return mode !== "tokens";
}

/**
 * Share of prompt input served from the cache: reads / (reads + writes +
 * uncached input). Null when there was no prompt input to measure.
 */
export function cacheReuseRatio(tokens: Pick<UsageTokenBreakdown, "uncachedInputTokens" | "cacheWriteTokens" | "cacheReadTokens">): number | null {
  const prompt = tokens.uncachedInputTokens + tokens.cacheWriteTokens + tokens.cacheReadTokens;
  return prompt > 0 ? tokens.cacheReadTokens / prompt : null;
}

export function formatPercent(ratio: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(ratio);
}
