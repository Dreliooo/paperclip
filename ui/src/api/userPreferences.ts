import type { UpdateUserPreferences, UserPreferences } from "@paperclipai/shared";
import { api } from "./client";

export const userPreferencesApi = {
  get: () => api.get<UserPreferences>("/user-preferences/me"),
  update: (data: UpdateUserPreferences) => api.patch<UserPreferences>("/user-preferences/me", data),
};
