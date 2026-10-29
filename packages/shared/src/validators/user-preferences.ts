import { z } from "zod";

export const USAGE_DISPLAY_MODES = ["tokens", "costs", "both"] as const;
/** Languages with a complete UI catalog. Keep in sync with ui/src/i18n COMPLETE_LOCALES. */
export const USER_PREFERENCE_LOCALES = ["en", "es"] as const;

export const usageDisplayModeSchema = z.enum(USAGE_DISPLAY_MODES);

export const updateUserPreferencesSchema = z
  .object({
    locale: z.enum(USER_PREFERENCE_LOCALES).nullable().optional(),
    usageDisplay: usageDisplayModeSchema.nullable().optional(),
  })
  .strict();

export type UpdateUserPreferences = z.infer<typeof updateUserPreferencesSchema>;
