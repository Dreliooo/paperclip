import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { userPreferences } from "@paperclipai/db";
import {
  USAGE_DISPLAY_MODES,
  USER_PREFERENCE_LOCALES,
  type UpdateUserPreferences,
  type UsageDisplayMode,
  type UserPreferences,
} from "@paperclipai/shared";

function readLocale(value: string | null | undefined): string | null {
  return value && (USER_PREFERENCE_LOCALES as readonly string[]).includes(value) ? value : null;
}

function readUsageDisplay(value: string | null | undefined): UsageDisplayMode | null {
  return value && (USAGE_DISPLAY_MODES as readonly string[]).includes(value) ? (value as UsageDisplayMode) : null;
}

function toPreferences(row: { locale: string | null; usageDisplay: string | null; updatedAt: Date } | undefined): UserPreferences {
  return {
    locale: readLocale(row?.locale),
    usageDisplay: readUsageDisplay(row?.usageDisplay),
    updatedAt: row?.updatedAt ?? null,
  };
}

/** Instance-wide, per-user display preferences (language, usage emphasis). */
export function userPreferenceService(db: Db) {
  return {
    async get(userId: string): Promise<UserPreferences> {
      const row = await db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, userId) });
      return toPreferences(row);
    },

    /** Partial update: only fields present in `patch` change; null clears a choice. */
    async update(userId: string, patch: UpdateUserPreferences): Promise<UserPreferences> {
      const now = new Date();
      const set: Partial<typeof userPreferences.$inferInsert> = { updatedAt: now };
      if (patch.locale !== undefined) set.locale = patch.locale;
      if (patch.usageDisplay !== undefined) set.usageDisplay = patch.usageDisplay;
      const [row] = await db
        .insert(userPreferences)
        .values({
          userId,
          locale: patch.locale ?? null,
          usageDisplay: patch.usageDisplay ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({ target: [userPreferences.userId], set })
        .returning();
      return toPreferences(row);
    },
  };
}
