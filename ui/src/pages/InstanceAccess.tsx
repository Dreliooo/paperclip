import { useTranslation } from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldCheck } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { Card } from "@/components/ui/card";
import { companyDirectoryQueryOptions, useAccountIdentity } from "@/api/companies-query";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";

export function InstanceAccess() {
  const { t } = useTranslation();
  const { userId: accountUserId, settled: accountSettled } = useAccountIdentity();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setBreadcrumbs([
      { label: t("ui3g4.instanceAccess.settings"), href: "/company/settings" },
      { label: t("ui3g4.instanceAccess.instanceSettings"), href: "/company/settings/instance/general" },
      { label: t("ui3g4.instanceAccess.access") },
    ]);
  }, [setBreadcrumbs, t]);

  const usersQuery = useQuery({
    queryKey: queryKeys.access.adminUsers(search),
    queryFn: () => accessApi.searchAdminUsers(search),
  });

  const companiesQuery = useQuery({
    ...companyDirectoryQueryOptions(accountUserId),
    enabled: accountSettled && usersQuery.isSuccess,
  });
  const companies = companiesQuery.data ?? [];

  const selectedUser = useMemo(
    () => usersQuery.data?.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, usersQuery.data],
  );

  const userAccessQuery = useQuery({
    queryKey: queryKeys.access.userCompanyAccess(selectedUserId ?? ""),
    queryFn: () => accessApi.getUserCompanyAccess(selectedUserId!),
    enabled: !!selectedUserId,
  });

  useEffect(() => {
    if (!selectedUserId && usersQuery.data?.[0]) {
      setSelectedUserId(usersQuery.data[0].id);
    }
  }, [selectedUserId, usersQuery.data]);

  useEffect(() => {
    if (!userAccessQuery.data) return;
    setSelectedCompanyIds(
      new Set(
        userAccessQuery.data.companyAccess
          .filter((membership) => membership.status === "active")
          .map((membership) => membership.companyId),
      ),
    );
  }, [userAccessQuery.data]);

  const updateCompanyAccessMutation = useMutation({
    mutationFn: () => accessApi.setUserCompanyAccess(selectedUserId!, [...selectedCompanyIds]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.userCompanyAccess(selectedUserId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.adminUsers(search) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      pushToast({ title: t("ui3g4.instanceAccess.orgAccessUpdated"), tone: "success" });
    },
  });

  const setAdminMutation = useMutation({
    mutationFn: async (makeAdmin: boolean) => {
      if (!selectedUserId) throw new Error("No user selected");
      if (makeAdmin) return accessApi.promoteInstanceAdmin(selectedUserId);
      return accessApi.demoteInstanceAdmin(selectedUserId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.adminUsers(search) });
      if (selectedUserId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.access.userCompanyAccess(selectedUserId) });
      }
      pushToast({ title: t("ui3g4.instanceAccess.instanceRoleUpdated"), tone: "success" });
    },
  });

  if (usersQuery.isLoading || !accountSettled || (usersQuery.isSuccess && companiesQuery.isPending)) {
    return <div className="text-sm text-muted-foreground">{t("ui3g4.instanceAccess.loading")}</div>;
  }

  if (usersQuery.error) {
    const message =
      usersQuery.error instanceof ApiError && usersQuery.error.status === 403
        ? t("ui3g4.instanceAccess.adminRequired")
        : usersQuery.error instanceof Error
          ? usersQuery.error.message
          : t("ui3g4.instanceAccess.loadUsersFailed");
    return <div className="text-sm text-destructive">{message}</div>;
  }

  if (companiesQuery.error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{t("ui3g4.instanceAccess.loadOrgsFailed")}</p>
        <Button onClick={() => void companiesQuery.refetch()}>{t("ui3g4.instanceAccess.tryAgain")}</Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("ui3g4.instanceAccess.heading")}</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("ui3g4.instanceAccess.intro")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-(--gtc-34)">
        <Card className="block space-y-4 p-4">
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("ui3g4.instanceAccess.searchUsers")}</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("ui3g4.instanceAccess.searchPlaceholder")}
            />
          </label>
          <div className="space-y-2">
            {(usersQuery.data ?? []).map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
                className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                  user.id === selectedUserId
                    ? "border-foreground bg-accent"
                    : "border-border hover:bg-accent/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{user.name || user.email || user.id}</div>
                    <div className="truncate text-sm text-muted-foreground">{user.email || user.id}</div>
                  </div>
                  {user.isInstanceAdmin ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {t("ui3g4.instanceAccess.activeMemberships", { count: user.activeCompanyMembershipCount })}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="block space-y-4 p-5">
          {!selectedUserId ? (
            <div className="text-sm text-muted-foreground">{t("ui3g4.instanceAccess.selectUser")}</div>
          ) : userAccessQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">{t("ui3g4.instanceAccess.loadingUserAccess")}</div>
          ) : userAccessQuery.error ? (
            <div className="text-sm text-destructive">
              {userAccessQuery.error instanceof Error ? userAccessQuery.error.message : t("ui3g4.instanceAccess.loadUserAccessFailed")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">
                    {selectedUser?.name || selectedUser?.email || selectedUserId}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedUser?.email || selectedUserId}
                  </div>
                </div>
                <Button
                  variant={selectedUser?.isInstanceAdmin ? "outline" : "default"}
                  onClick={() => setAdminMutation.mutate(!(selectedUser?.isInstanceAdmin ?? false))}
                  disabled={setAdminMutation.isPending}
                >
                  {selectedUser?.isInstanceAdmin ? t("ui3g4.instanceAccess.removeAdmin") : t("ui3g4.instanceAccess.promoteAdmin")}
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">{t("ui3g4.instanceAccess.orgAccess")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("ui3g4.instanceAccess.toggleMembership")}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {companies.map((company) => (
                    <label
                      key={company.id}
                      className="flex items-start gap-3 rounded-lg border border-border px-3 py-3"
                    >
                      <Checkbox
                        checked={selectedCompanyIds.has(company.id)}
                        onCheckedChange={(checked) => {
                          setSelectedCompanyIds((current) => {
                            const next = new Set(current);
                            if (checked) next.add(company.id);
                            else next.delete(company.id);
                            return next;
                          });
                        }}
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">{company.name}</span>
                        <span className="block text-xs text-muted-foreground">{company.issuePrefix}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => updateCompanyAccessMutation.mutate()}
                    disabled={updateCompanyAccessMutation.isPending}
                  >
                    {updateCompanyAccessMutation.isPending ? t("ui3g4.instanceAccess.saving") : t("ui3g4.instanceAccess.saveOrgAccess")}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold">{t("ui3g4.instanceAccess.currentMemberships")}</h2>
                <div className="space-y-2">
                  {(userAccessQuery.data?.companyAccess ?? []).map((membership) => (
                    <div
                      key={membership.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">{membership.companyName || membership.companyId}</div>
                        <div className="text-muted-foreground">
                          {membership.membershipRole || t("ui3g4.instanceAccess.unset")} • {membership.status}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(membership.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
