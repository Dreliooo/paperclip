import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { Link } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { copyTextToClipboard } from "@/lib/clipboard";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n";
import type { TFunction } from "i18next";

const inviteRoleOptions = [
  {
    value: "viewer",
    labelKey: "ui3g1.InvitesSection.roleViewer",
    descriptionKey: "ui3g1.InvitesSection.viewerDescription",
    getsKey: "ui3g1.InvitesSection.viewerGets",
  },
  {
    value: "operator",
    labelKey: "ui3g1.InvitesSection.roleOperator",
    descriptionKey: "ui3g1.InvitesSection.operatorDescription",
    getsKey: "ui3g1.InvitesSection.operatorGets",
  },
  {
    value: "admin",
    labelKey: "ui3g1.InvitesSection.roleAdmin",
    descriptionKey: "ui3g1.InvitesSection.adminDescription",
    getsKey: "ui3g1.InvitesSection.adminGets",
  },
  {
    value: "owner",
    labelKey: "ui3g1.InvitesSection.roleOwner",
    descriptionKey: "ui3g1.InvitesSection.ownerDescription",
    getsKey: "ui3g1.InvitesSection.ownerGets",
  },
] as const;

const INVITE_HISTORY_PAGE_SIZE = 5;

function isInviteHistoryRow(value: unknown): value is Awaited<ReturnType<typeof accessApi.listInvites>>["invites"][number] {
  if (!value || typeof value !== "object") return false;
  return "id" in value && "state" in value && "createdAt" in value;
}

/** The Invites tab of the Members page (extracted from the former standalone Invites page). */
export function InvitesSection() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [humanRole, setHumanRole] = useState<"owner" | "admin" | "operator" | "viewer">("operator");
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [latestInviteCopied, setLatestInviteCopied] = useState(false);
  const latestInviteInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!latestInviteCopied) return;
    const timeout = window.setTimeout(() => {
      setLatestInviteCopied(false);
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [latestInviteCopied]);

  function selectLatestInviteUrl() {
    latestInviteInputRef.current?.focus();
    latestInviteInputRef.current?.select();
  }

  async function copyText(text: string, unavailableBody: string, afterFallback?: () => void) {
    try {
      await copyTextToClipboard(text);
      return true;
    } catch {
      afterFallback?.();
    }
    pushToast({
      title: t("ui3g1.InvitesSection.clipboardUnavailable"),
      body: unavailableBody,
      tone: "warn",
    });
    return false;
  }

  async function copyInviteUrl(url: string) {
    return copyText(url, t("ui3g1.InvitesSection.inviteUrlSelected"), selectLatestInviteUrl);
  }

  const inviteHistoryQueryKey = queryKeys.access.invites(selectedCompanyId ?? "", "all", INVITE_HISTORY_PAGE_SIZE);
  const invitesQuery = useInfiniteQuery({
    queryKey: inviteHistoryQueryKey,
    queryFn: ({ pageParam }) =>
      accessApi.listInvites(selectedCompanyId!, {
        limit: INVITE_HISTORY_PAGE_SIZE,
        offset: pageParam,
      }),
    enabled: !!selectedCompanyId,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
  const inviteHistory = useMemo(
    () =>
      invitesQuery.data?.pages.flatMap((page) =>
        Array.isArray(page?.invites) ? page.invites.filter(isInviteHistoryRow) : [],
      ) ?? [],
    [invitesQuery.data?.pages],
  );

  const createInviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createCompanyInvite(selectedCompanyId!, {
        allowedJoinTypes: "human",
        humanRole,
        agentMessage: null,
      }),
    onSuccess: async (invite) => {
      setLatestInviteUrl(invite.inviteUrl);
      setLatestInviteCopied(false);
      const copied = await copyText(invite.inviteUrl, t("ui3g1.InvitesSection.copyManuallyBelow"));

      await queryClient.invalidateQueries({ queryKey: inviteHistoryQueryKey });
      pushToast({
        title: t("ui3g1.InvitesSection.inviteCreated"),
        body: copied ? t("ui3g1.InvitesSection.inviteReadyCopied") : t("ui3g1.InvitesSection.inviteReady"),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("ui3g1.InvitesSection.failedCreate"),
        body: error instanceof Error ? error.message : t("ui3g1.InvitesSection.unknownError"),
        tone: "error",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => accessApi.revokeInvite(inviteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inviteHistoryQueryKey });
      pushToast({ title: t("ui3g1.InvitesSection.inviteRevoked"), tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: t("ui3g1.InvitesSection.failedRevoke"),
        body: error instanceof Error ? error.message : t("ui3g1.InvitesSection.unknownError"),
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return <div className="text-sm text-muted-foreground">{t("ui3g1.InvitesSection.selectOrganization")}</div>;
  }

  if (invitesQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("ui3g1.InvitesSection.loadingInvites")}</div>;
  }

  if (invitesQuery.error) {
    const message =
      invitesQuery.error instanceof ApiError && invitesQuery.error.status === 403
        ? t("ui3g1.InvitesSection.noPermission")
        : invitesQuery.error instanceof Error
          ? invitesQuery.error.message
          : t("ui3g1.InvitesSection.failedLoad");
    return <div className="text-sm text-destructive">{message}</div>;
  }

  return (
    <div className="max-w-6xl space-y-8">
      <p className="max-w-3xl text-sm text-muted-foreground">
        {t("ui3g1.InvitesSection.introDescription")}
      </p>

      <section className="space-y-4 rounded-xl border border-border p-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t("ui3g1.InvitesSection.invitePerson")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("ui3g1.InvitesSection.invitePersonDescription")}
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("ui3g1.InvitesSection.chooseRole")}</legend>
          <div className="rounded-xl border border-border">
            {inviteRoleOptions.map((option, index) => {
              const checked = humanRole === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer gap-3 px-4 py-4 ${index > 0 ? "border-t border-border" : ""}`}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value={option.value}
                    checked={checked}
                    onChange={() => setHumanRole(option.value)}
                    className="mt-1 h-4 w-4 border-border text-foreground"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{t(option.labelKey)}</span>
                      {option.value === "operator" ? (
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          {t("ui3g1.InvitesSection.default")}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="block max-w-2xl text-sm text-muted-foreground">{t(option.descriptionKey)}</span>
                    <span className="block text-sm text-foreground">{t(option.getsKey)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
          {t("ui3g1.InvitesSection.singleUseNotice")}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => createInviteMutation.mutate()} disabled={createInviteMutation.isPending}>
            {createInviteMutation.isPending ? t("ui3g1.InvitesSection.creatingInvite") : t("ui3g1.InvitesSection.createInvite")}
          </Button>
          <span className="text-sm text-muted-foreground">{t("ui3g1.InvitesSection.historyAuditTrail")}</span>
        </div>

        {latestInviteUrl ? (
          <div className="space-y-3 rounded-lg border border-border px-4 py-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{t("ui3g1.InvitesSection.latestInviteLink")}</div>
                {latestInviteCopied ? (
                  <div className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                    <Check className="h-3.5 w-3.5" />
                    {t("ui3g1.InvitesSection.copied")}
                  </div>
                ) : null}
              </div>
              <div className="text-sm text-muted-foreground">
                {t("ui3g1.InvitesSection.urlIncludesDomain")}
              </div>
            </div>
            <label className="block space-y-1">
              <span className="sr-only">{t("ui3g1.InvitesSection.latestInviteUrl")}</span>
              <input
                ref={latestInviteInputRef}
                readOnly
                value={latestInviteUrl}
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
                className="w-full rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-foreground outline-none transition-colors selection:bg-primary selection:text-primary-foreground focus:border-ring"
                aria-label={t("ui3g1.InvitesSection.latestInviteUrl")}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  const copied = await copyInviteUrl(latestInviteUrl);
                  setLatestInviteCopied(copied);
                }}
              >
                <Copy className="h-4 w-4" />
                {t("ui3g1.InvitesSection.copyLink")}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{t("ui3g1.InvitesSection.inviteHistory")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("ui3g1.InvitesSection.inviteHistoryDescription")}
            </p>
          </div>
          <Link to="/inbox/requests" className="text-sm underline underline-offset-4">
            {t("ui3g1.InvitesSection.openJoinQueue")}
          </Link>
        </div>

        {inviteHistory.length === 0 ? (
          <div className="border-t border-border px-5 py-8 text-sm text-muted-foreground">
            {t("ui3g1.InvitesSection.noInvites")}
          </div>
        ) : (
          <div className="border-t border-border">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("ui3g1.InvitesSection.colState")}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("ui3g1.InvitesSection.colFor")}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("ui3g1.InvitesSection.colInvitedBy")}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("ui3g1.InvitesSection.colCreated")}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("ui3g1.InvitesSection.colJoinRequest")}</th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">{t("ui3g1.InvitesSection.colAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {inviteHistory.map((invite) => (
                    <tr key={invite.id} className="border-b border-border last:border-b-0">
                      <td className="px-5 py-3 align-top">
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          {formatInviteState(invite.state, t)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 align-top">{formatInviteAudience(invite, t)}</td>
                      <td className="px-5 py-3 align-top">
                        <div>{invite.invitedByUser?.name || invite.invitedByUser?.email || t("ui3g1.InvitesSection.unknownInviter")}</div>
                        {invite.invitedByUser?.email && invite.invitedByUser.name ? (
                          <div className="text-xs text-muted-foreground">{invite.invitedByUser.email}</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 align-top text-muted-foreground">
                        {new Date(invite.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 align-top">
                        {invite.relatedJoinRequestId ? (
                          <Link to="/inbox/requests" className="underline underline-offset-4">
                            {t("ui3g1.InvitesSection.reviewRequest")}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right align-top">
                        {invite.state === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revokeMutation.mutate(invite.id)}
                            disabled={revokeMutation.isPending}
                          >
                            {t("ui3g1.InvitesSection.revoke")}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("ui3g1.InvitesSection.inactiveState")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invitesQuery.hasNextPage ? (
              <div className="flex justify-center border-t border-border px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => invitesQuery.fetchNextPage()}
                  disabled={invitesQuery.isFetchingNextPage}
                >
                  {invitesQuery.isFetchingNextPage ? t("ui3g1.InvitesSection.loadingMore") : t("ui3g1.InvitesSection.viewMore")}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function formatInviteState(state: "active" | "accepted" | "expired" | "revoked", t: TFunction) {
  switch (state) {
    case "active": return t("ui3g1.InvitesSection.stateActive");
    case "accepted": return t("ui3g1.InvitesSection.stateAccepted");
    case "expired": return t("ui3g1.InvitesSection.stateExpired");
    case "revoked": return t("ui3g1.InvitesSection.stateRevoked");
  }
}

function formatInviteAudience(invite: Awaited<ReturnType<typeof accessApi.listInvites>>["invites"][number], t: TFunction) {
  if (invite.allowedJoinTypes === "agent") return t("ui3g1.InvitesSection.audienceAgent");
  if (invite.allowedJoinTypes === "both") return invite.humanRole ? t("ui3g1.InvitesSection.audienceHumanOrAgentRole", { role: invite.humanRole }) : t("ui3g1.InvitesSection.audienceHumanOrAgent");
  return invite.humanRole ?? t("ui3g1.InvitesSection.audienceHuman");
}
