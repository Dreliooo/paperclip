import { check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Per-user display preferences that follow the person across companies and
 * devices (like user_sidebar_preferences). Null means "not chosen": the UI
 * keeps its defaults, so adding this table changes nothing for existing users.
 */
export const userPreferences = pgTable(
  "user_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    /** UI language (BCP 47 tag of a complete UI catalog, e.g. "en", "es"). */
    locale: text("locale"),
    /** Usage metrics emphasis: "tokens", "costs" or "both". */
    usageDisplay: text("usage_display"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userUq: uniqueIndex("user_preferences_user_uq").on(table.userId),
    usageDisplayCheck: check(
      "user_preferences_usage_display_check",
      sql`${table.usageDisplay} is null or ${table.usageDisplay} in ('tokens', 'costs', 'both')`,
    ),
  }),
);
