/**
 * Small, testable helpers behind the objective dialog. Limits are optional:
 * an empty field means "no limit", never zero.
 */

export const OBJECTIVE_TIME_PRESETS = ["none", "1h", "4h", "24h", "3d", "7d"] as const;
export type ObjectiveTimePreset = (typeof OBJECTIVE_TIME_PRESETS)[number];

const PRESET_MS: Record<Exclude<ObjectiveTimePreset, "none">, number> = {
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "3d": 3 * 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
};

export function deadlineFromPreset(preset: ObjectiveTimePreset, now: Date): string | null {
  return preset === "none" ? null : new Date(now.getTime() + PRESET_MS[preset]).toISOString();
}

export function parseCriteria(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 20);
}

/** "10", "10.5", "10,50" or "US$ 10" → cents. Empty → null. Invalid → undefined. */
export function parseDollarsToCents(input: string): number | null | undefined {
  const cleaned = input.replace(/us\$|\$|usd/gi, "").replace(/\s+/g, "").replace(",", ".");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return undefined;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 ? cents : undefined;
}

/** "500000", "500k", "1.5M" → tokens. Empty → null. Invalid → undefined. */
export function parseTokenLimit(input: string): number | null | undefined {
  const cleaned = input.replace(/\s+/g, "").replace(",", ".").toLowerCase();
  if (cleaned === "") return null;
  const match = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(cleaned);
  if (!match) return undefined;
  const multiplier = match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
  const tokens = Math.round(Number(match[1]) * multiplier);
  return tokens > 0 ? tokens : undefined;
}

export function formatTokensShort(tokens: number): string {
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

/** Share of a limit already used, clamped to 0–100. */
export function usagePercent(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

/** First line of the objective, trimmed for a task title. */
export function objectiveTaskTitle(objective: string): string {
  const first = objective.split("\n").map((line) => line.trim()).find(Boolean) ?? objective.trim();
  return first.length > 120 ? `${first.slice(0, 117)}…` : first;
}
