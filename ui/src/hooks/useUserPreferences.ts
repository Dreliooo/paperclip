import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateUserPreferences, UsageDisplayMode, UserPreferences } from "@paperclipai/shared";
import { userPreferencesApi } from "../api/userPreferences";
import { isSelectableLocale, setLocale } from "../i18n";
import { queryKeys } from "../lib/queryKeys";

export const DEFAULT_USAGE_DISPLAY: UsageDisplayMode = "both";

const EMPTY_PREFERENCES: UserPreferences = { locale: null, usageDisplay: null, updatedAt: null };

/** The signed-in person's display preferences (language, usage emphasis). */
export function useUserPreferences() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.userPreferences,
    queryFn: () => userPreferencesApi.get(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (patch: UpdateUserPreferences) => userPreferencesApi.update(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.userPreferences });
      const previous = queryClient.getQueryData<UserPreferences>(queryKeys.userPreferences);
      queryClient.setQueryData<UserPreferences>(queryKeys.userPreferences, {
        ...(previous ?? EMPTY_PREFERENCES),
        ...patch,
      } as UserPreferences);
      return { previous };
    },
    onError: (_error, _patch, context) => {
      queryClient.setQueryData(queryKeys.userPreferences, context?.previous ?? EMPTY_PREFERENCES);
    },
    onSuccess: (data) => queryClient.setQueryData(queryKeys.userPreferences, data),
  });
  const preferences = query.data ?? EMPTY_PREFERENCES;
  return {
    preferences,
    usageDisplay: preferences.usageDisplay ?? DEFAULT_USAGE_DISPLAY,
    loaded: query.isFetched,
    error: query.error ?? mutation.error ?? null,
    saving: mutation.isPending,
    update: mutation.mutateAsync,
  };
}

/**
 * Applies the user's saved language once it loads, so the choice follows the
 * person across devices. Without a saved choice the current language stays.
 */
export function useLocalePreferenceSync() {
  const { preferences } = useUserPreferences();
  useEffect(() => {
    if (isSelectableLocale(preferences.locale)) setLocale(preferences.locale);
  }, [preferences.locale]);
}

export function LocalePreferenceSync() {
  useLocalePreferenceSync();
  return null;
}
