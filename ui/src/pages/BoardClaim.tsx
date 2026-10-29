import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "@/lib/router";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/i18n";

export function BoardClaimPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const token = (params.token ?? "").trim();
  const code = (searchParams.get("code") ?? "").trim();
  const currentPath = useMemo(
    () => `/board-claim/${encodeURIComponent(token)}${code ? `?code=${encodeURIComponent(code)}` : ""}`,
    [token, code],
  );

  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const statusQuery = useQuery({
    queryKey: ["board-claim", token, code],
    queryFn: () => accessApi.getBoardClaimStatus(token, code),
    enabled: token.length > 0 && code.length > 0,
    retry: false,
  });

  const claimMutation = useMutation({
    mutationFn: () => accessApi.claimBoard(token, code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.health });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      await statusQuery.refetch();
    },
  });

  if (!token || !code) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">{t("ui2g1.boardClaim.invalidUrl")}</div>;
  }

  if (statusQuery.isLoading || sessionQuery.isLoading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">{t("ui2g1.boardClaim.loading")}</div>;
  }

  if (statusQuery.error) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-lg font-semibold">{t("ui2g1.boardClaim.challengeUnavailable")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {statusQuery.error instanceof Error ? statusQuery.error.message : t("ui2g1.boardClaim.invalidChallenge")}
          </p>
        </Card>
      </div>
    );
  }

  const status = statusQuery.data;
  if (!status) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-destructive">{t("ui2g1.boardClaim.challengeUnavailableNoData")}</div>;
  }

  if (status.status === "claimed") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-lg font-semibold">{t("ui2g1.boardClaim.claimedTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("ui2g1.boardClaim.claimedBody")}
          </p>
          <Button asChild className="mt-4">
            <Link to="/">{t("ui2g1.boardClaim.openBoard")}</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (!sessionQuery.data) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="block p-6">
          <h1 className="text-lg font-semibold">{t("ui2g1.boardClaim.signInTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("ui2g1.boardClaim.signInBody")}
          </p>
          <Button asChild className="mt-4">
            <Link to={`/auth?next=${encodeURIComponent(currentPath)}`}>{t("ui2g1.boardClaim.signInLink")}</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="block p-6">
        <h1 className="text-xl font-semibold">{t("ui2g1.boardClaim.claimTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("ui2g1.boardClaim.claimBody")}
        </p>

        {claimMutation.error && (
          <p className="mt-3 text-sm text-destructive">
            {claimMutation.error instanceof Error ? claimMutation.error.message : t("ui2g1.boardClaim.claimFailed")}
          </p>
        )}

        <Button
          className="mt-5"
          onClick={() => claimMutation.mutate()}
          disabled={claimMutation.isPending}
        >
          {claimMutation.isPending ? t("ui2g1.boardClaim.claiming") : t("ui2g1.boardClaim.claimButton")}
        </Button>
      </Card>
    </div>
  );
}
