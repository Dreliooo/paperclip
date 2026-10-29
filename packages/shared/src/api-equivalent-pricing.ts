/**
 * API-equivalent cost: what recorded token usage WOULD have cost at the
 * provider's published pay-as-you-go API list prices.
 *
 * This is an estimate for comparison only. It is never money that was charged,
 * and it is not consumption of a subscription's allowance. Usage billed through
 * a subscription is still priced here so operators can compare plans; the real
 * spend reported by the provider is tracked separately in the cost ledger.
 *
 * Token categories follow the adapter usage contract (UsageSummary):
 *   inputTokens        uncached input + cache writes (excludes cache reads)
 *   cacheReadTokens    tokens served from the prompt cache
 *   cacheWriteTokens   subset of inputTokens written to the cache, when reported
 *   outputTokens       generated tokens
 * so no token is counted twice: uncached = input − cacheWrite.
 */

export interface ApiRateCard {
  provider: string;
  /** Canonical model id this card prices. */
  model: string;
  /** USD per million tokens. */
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  /** 5-minute cache write; 1-hour writes cost more (see cacheWrite1hPerMTok). */
  cacheWritePerMTok: number;
  cacheWrite1hPerMTok?: number;
  /** Where the numbers come from and when they were checked. */
  source: string;
  verifiedAt: string;
  /** Caveats that make the result a bound rather than an exact figure. */
  notes?: string[];
}

const ANTHROPIC_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
const ANTHROPIC_VERIFIED_AT = "2026-10-06";
const OPENAI_SOURCE = "https://developers.openai.com/api/docs/pricing";
const OPENAI_VERIFIED_AT = "2026-09-30";

/**
 * Anthropic first-party API list prices. Cache writes are 1.25× (5-minute) and
 * 2× (1-hour) the base input price; cache-read multipliers differ by model and
 * are listed explicitly. Models not listed here are reported as unpriced.
 */
function anthropic(
  model: string,
  input: number,
  output: number,
  cacheRead: number,
  notes?: string[],
): ApiRateCard {
  return {
    provider: "anthropic",
    model,
    inputPerMTok: input,
    outputPerMTok: output,
    cacheReadPerMTok: cacheRead,
    cacheWritePerMTok: input * 1.25,
    cacheWrite1hPerMTok: input * 2,
    source: ANTHROPIC_SOURCE,
    verifiedAt: ANTHROPIC_VERIFIED_AT,
    ...(notes ? { notes } : {}),
  };
}

function openai(model: string, input: number, cacheRead: number, cacheWrite: number, output: number): ApiRateCard {
  return {
    provider: "openai",
    model,
    inputPerMTok: input,
    outputPerMTok: output,
    cacheReadPerMTok: cacheRead,
    cacheWritePerMTok: cacheWrite,
    source: OPENAI_SOURCE,
    verifiedAt: OPENAI_VERIFIED_AT,
    notes: ["Standard service tier and short-context rates."],
  };
}

export const API_RATE_CARDS: readonly ApiRateCard[] = [
  anthropic("claude-fable-5-1", 10, 50, 0.25),
  anthropic("claude-mythos-5-1", 10, 50, 0.25),
  anthropic("claude-fable-5", 10, 50, 1),
  anthropic("claude-mythos-5", 10, 50, 1),
  anthropic("claude-opus-5-5", 4, 20, 0.2),
  anthropic("claude-opus-5", 5, 25, 0.5),
  anthropic("claude-opus-4-8", 5, 25, 0.5),
  anthropic("claude-opus-4-7", 5, 25, 0.5),
  anthropic("claude-opus-4-6", 5, 25, 0.5),
  anthropic("claude-sonnet-5-5", 2, 10, 0.2),
  anthropic("claude-sonnet-5", 2, 10, 0.2),
  anthropic("claude-sonnet-4-6", 3, 15, 0.3),
  anthropic("claude-haiku-5-5", 0.1, 0.5, 0.01, [
    "Rates for prompts up to 100K tokens; longer prompts cost $0.50/$2.50 per MTok, so this is a lower bound.",
  ]),
  anthropic("claude-haiku-4-5", 1, 5, 0.1),
  openai("gpt-6-astra", 10, 1, 12.5, 50),
  openai("gpt-6-sol", 2, 0.2, 2.5, 10),
  openai("gpt-6.1-sol", 2, 0.1, 2.5, 10),
  openai("gpt-6-luna", 0.1, 0.01, 0.125, 0.5),
  openai("gpt-5.6-sol", 4, 0.4, 5, 20),
];

const CARDS_BY_KEY = new Map(API_RATE_CARDS.map((card) => [`${card.provider}:${card.model}`, card]));

/**
 * Map a recorded model string to a catalog id: strips routing prefixes
 * ("anthropic/…", "openai/…") and dated snapshot suffixes ("…-20260101").
 */
export function normalizeModelForPricing(model: string): string {
  let id = model.trim().toLowerCase();
  const slash = id.lastIndexOf("/");
  if (slash >= 0) id = id.slice(slash + 1);
  id = id.replace(/[-@]\d{8}$/, "");
  id = id.replace(/\[1m\]$/, "");
  return id;
}

function inferProvider(provider: string, model: string): string {
  const p = provider.trim().toLowerCase();
  if (p === "anthropic" || p === "claude") return "anthropic";
  if (p === "openai" || p === "codex") return "openai";
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gpt-")) return "openai";
  return p;
}

export function findApiRateCard(provider: string, model: string): ApiRateCard | null {
  const normalized = normalizeModelForPricing(model);
  return CARDS_BY_KEY.get(`${inferProvider(provider, normalized)}:${normalized}`) ?? null;
}

export interface TokenUsageCounts {
  inputTokens: number;
  cacheReadTokens: number;
  /** Null when the source did not report cache writes separately. */
  cacheWriteTokens: number | null;
  outputTokens: number;
}

export interface ApiEquivalentEstimate {
  /** Null when the model has no rate card (unpriced, not free). */
  cents: number | null;
  /** What cache reads would have cost as uncached input, minus what they cost. */
  cacheSavingsCents: number | null;
  rateCard: ApiRateCard | null;
  /** True when cache writes were not reported and were priced as plain input. */
  cacheWritesUnknown: boolean;
}

const PER_MILLION = 1_000_000;

export function estimateApiEquivalent(
  provider: string,
  model: string,
  usage: TokenUsageCounts,
): ApiEquivalentEstimate {
  const card = findApiRateCard(provider, model);
  const cacheWritesUnknown = usage.cacheWriteTokens === null;
  if (!card) return { cents: null, cacheSavingsCents: null, rateCard: null, cacheWritesUnknown };
  const writes = Math.min(Math.max(usage.cacheWriteTokens ?? 0, 0), Math.max(usage.inputTokens, 0));
  const uncached = Math.max(usage.inputTokens - writes, 0);
  const reads = Math.max(usage.cacheReadTokens, 0);
  const output = Math.max(usage.outputTokens, 0);
  const dollars =
    (uncached * card.inputPerMTok +
      writes * card.cacheWritePerMTok +
      reads * card.cacheReadPerMTok +
      output * card.outputPerMTok) /
    PER_MILLION;
  const savings = (reads * (card.inputPerMTok - card.cacheReadPerMTok)) / PER_MILLION;
  return {
    cents: dollars * 100,
    cacheSavingsCents: savings * 100,
    rateCard: card,
    cacheWritesUnknown,
  };
}
