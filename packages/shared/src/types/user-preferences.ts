/** How usage metrics are emphasised: token counts, money, or both. */
export type UsageDisplayMode = "tokens" | "costs" | "both";

export interface UserPreferences {
  /** UI language chosen by the user; null keeps the browser/default language. */
  locale: string | null;
  /** Usage metrics emphasis; null means the default ("both"). */
  usageDisplay: UsageDisplayMode | null;
  updatedAt: Date | null;
}
