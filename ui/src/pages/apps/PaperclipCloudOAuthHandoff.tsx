import { useCallback, useEffect, useState } from "react";
import { t, useTranslation } from "@/i18n";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigateTopLevel } from "@/lib/browserNavigation";
import {
  clearPendingCloudHandoff,
  prepareOAuthNavigation,
  readPendingCloudHandoff,
} from "@/lib/oauthHandoff";

export type ManagedOAuthHandoffPhase = "loading" | "reauthenticating" | "error";

export function ManagedOAuthHandoffState({
  phase,
  error,
  onRetry,
  onCancel,
}: {
  phase: ManagedOAuthHandoffPhase;
  error?: string | null;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const failed = phase === "error";
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex max-w-lg items-start gap-3">
        <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
          {failed ? (
            <Link2 className="h-5 w-5 text-destructive" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">
            {failed ? t("ui3g6.PaperclipCloudOAuthHandoff.failedTitle") : t("ui3g6.PaperclipCloudOAuthHandoff.preparingTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {failed
              ? error ?? t("ui3g6.PaperclipCloudOAuthHandoff.providerFailed")
              : phase === "reauthenticating"
                ? t("ui3g6.PaperclipCloudOAuthHandoff.refreshing")
                : t("ui3g6.PaperclipCloudOAuthHandoff.opening")}
          </p>
          {failed ? (
            <div className="mt-6 flex items-center gap-2">
              <Button type="button" onClick={onRetry}>{t("ui3g6.PaperclipCloudOAuthHandoff.tryAgain")}</Button>
              <Button type="button" variant="ghost" onClick={onCancel}>{t("ui3g6.PaperclipCloudOAuthHandoff.returnToPaperclip")}</Button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

/** Fixed tenant landing used only after Paperclip Cloud refreshes login. */
export function PaperclipCloudOAuthHandoffPage() {
  const [phase, setPhase] = useState<ManagedOAuthHandoffPhase>("loading");
  const [error, setError] = useState<string | null>(null);

  const resume = useCallback(async () => {
    const handoff = readPendingCloudHandoff();
    if (!handoff) {
      setPhase("error");
      setError(t("ui3g6.PaperclipCloudOAuthHandoff.expired"));
      return;
    }
    setPhase("loading");
    setError(null);
    try {
      const target = await prepareOAuthNavigation({ authorizationUrl: "", handoff });
      if (target.kind === "reauthentication") {
        setPhase("error");
        setError(t("ui3g6.PaperclipCloudOAuthHandoff.refreshFailed"));
        return;
      }
      clearPendingCloudHandoff();
      navigateTopLevel(target.url);
    } catch (caught) {
      setPhase("error");
      setError(caught instanceof Error ? caught.message : t("ui3g6.PaperclipCloudOAuthHandoff.prepareFailed"));
    }
  }, []);

  useEffect(() => {
    void resume();
  }, [resume]);

  return (
    <ManagedOAuthHandoffState
      phase={phase}
      error={error}
      onRetry={() => void resume()}
      onCancel={() => {
        clearPendingCloudHandoff();
        navigateTopLevel("/");
      }}
    />
  );
}
