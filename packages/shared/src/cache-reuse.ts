/**
 * Prompt-cache reuse assessment for an agent or a conversation.
 *
 * Providers bill cache reads far below uncached input, so a sudden drop in
 * reuse usually means avoidable cost. A single run with few reads is not
 * proof that the cache was lost, so the assessment compares the latest run
 * against the agent's/conversation's own recent baseline and only names
 * causes it can see in the run records (new session, model change, a gap
 * longer than the default cache lifetime). It never claims certainty.
 */

export interface CacheRunSample {
  runId: string;
  startedAt: string | null;
  finishedAt: string | null;
  provider: string;
  models: string[];
  sessionIdBefore: string | null;
  sessionIdAfter: string | null;
  uncachedInputTokens: number;
  /** Null when the provider did not report cache writes separately. */
  cacheWriteTokens: number | null;
  cacheReadTokens: number;
  outputTokens: number;
  /** API-equivalent saving from this run's cache reads; null when unpriced. */
  cacheSavingsCents: number | null;
}

export type CacheChangeCause = "new_session" | "model_changed" | "long_gap";

export interface CacheRunAssessment extends CacheRunSample {
  /** reads / (reads + writes + uncached input); null below the measurable size. */
  reuseRatio: number | null;
  /** Milliseconds between the previous run's end and this run's start. */
  gapMs: number | null;
  causes: CacheChangeCause[];
}

export type CacheReuseStatus = "high" | "moderate" | "low" | "dropped" | "insufficient";

export interface CacheReuseAssessment {
  status: CacheReuseStatus;
  /** Why the status is "insufficient", when it is. */
  insufficientReason: "few_runs" | "not_reported" | null;
  latestRatio: number | null;
  baselineRatio: number | null;
  /** Causes visible on the latest run (only meaningful when status is "dropped"). */
  latestCauses: CacheChangeCause[];
  savingsCents: number | null;
  runs: CacheRunAssessment[];
}

/** Below this prompt size a ratio says little (system prompt alone may not cache). */
export const MIN_MEASURABLE_PROMPT_TOKENS = 2_000;
/** Default prompt-cache lifetime; longer idle gaps let the cache expire. */
export const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const MIN_RUNS = 3;

function ms(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Runs must be ordered oldest → newest. */
export function assessCacheReuse(samples: readonly CacheRunSample[]): CacheReuseAssessment {
  const runs: CacheRunAssessment[] = samples.map((run, index) => {
    const prompt = run.uncachedInputTokens + (run.cacheWriteTokens ?? 0) + run.cacheReadTokens;
    const previous = index > 0 ? samples[index - 1]! : null;
    const causes: CacheChangeCause[] = [];
    let gapMs: number | null = null;
    if (previous) {
      if (!run.sessionIdBefore || (previous.sessionIdAfter && run.sessionIdBefore !== previous.sessionIdAfter)) {
        causes.push("new_session");
      }
      const before = [...previous.models].sort().join(",");
      const now = [...run.models].sort().join(",");
      if (before && now && before !== now) causes.push("model_changed");
      const end = ms(previous.finishedAt);
      const start = ms(run.startedAt);
      if (end !== null && start !== null) {
        gapMs = Math.max(0, start - end);
        if (gapMs > DEFAULT_CACHE_TTL_MS) causes.push("long_gap");
      }
    }
    return {
      ...run,
      reuseRatio: prompt >= MIN_MEASURABLE_PROMPT_TOKENS ? run.cacheReadTokens / prompt : null,
      gapMs,
      causes,
    };
  });

  const priced = runs.filter((run) => run.cacheSavingsCents !== null);
  const savingsCents = priced.length > 0 ? priced.reduce((sum, run) => sum + (run.cacheSavingsCents ?? 0), 0) : null;
  const measurable = runs.filter((run) => run.reuseRatio !== null);
  const base = { savingsCents, runs, latestCauses: [] as CacheChangeCause[] };

  if (measurable.length < MIN_RUNS) {
    return { ...base, status: "insufficient", insufficientReason: "few_runs", latestRatio: measurable.at(-1)?.reuseRatio ?? null, baselineRatio: null };
  }
  // No reads and no reported writes anywhere: the integration may simply not
  // report cache counters, so a 0% ratio would be misleading.
  if (measurable.every((run) => run.cacheReadTokens === 0 && run.cacheWriteTokens === null)) {
    return { ...base, status: "insufficient", insufficientReason: "not_reported", latestRatio: null, baselineRatio: null };
  }

  const latest = measurable.at(-1)!;
  const history = measurable.slice(-11, -1).map((run) => run.reuseRatio!);
  const baselineRatio = median(history);
  const latestRatio = latest.reuseRatio!;
  const recent = median(measurable.slice(-5).map((run) => run.reuseRatio!)) ?? latestRatio;

  let status: CacheReuseStatus;
  if (baselineRatio !== null && baselineRatio >= 0.3 && latestRatio < baselineRatio * 0.5) status = "dropped";
  else if (recent >= 0.6) status = "high";
  else if (recent < 0.3) status = "low";
  else status = "moderate";

  return {
    ...base,
    status,
    insufficientReason: null,
    latestRatio,
    baselineRatio,
    latestCauses: status === "dropped" ? latest.causes : [],
  };
}
