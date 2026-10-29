import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deriveCreationAttribution, type FolderListItem, type Project, type ProjectInvolvementReason } from "@paperclipai/shared";
import { projectsApi } from "../api/projects";
import { foldersApi } from "../api/folders";
import { accessApi } from "../api/access";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { buildCompanyUserLabelMap } from "../lib/company-members";
import { formatUserLabel } from "../lib/assignees";
import { useSearchParams } from "@/lib/router";
import { useToastActions } from "../context/ToastContext";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useTranslation } from "@/i18n";
import { queryKeys } from "../lib/queryKeys";
import { EntityRow } from "../components/EntityRow";
import { ProjectTile } from "../components/ProjectTile";
import { StatusBadge } from "../components/StatusBadge";
import { MembershipAction } from "../components/MembershipAction";
import { StarToggle } from "../components/StarToggle";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatDate, formatNumber, formatProjectBudget, projectUrl } from "../lib/utils";
import {
  isStarred,
  resourceMembershipState,
  useResourceMembershipMutation,
  useResourceMemberships,
} from "../hooks/useResourceMemberships";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowUpDown, Check, Hexagon, MoreHorizontal, Plus } from "lucide-react";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  DeleteFolderDialog,
  FolderChip,
  FolderFormDialog,
  FolderRail,
  FolderSwatch,
  MobileFolderSheet,
  MoveToMenu,
  folderSearchValue,
  normalizeFolderSelection,
  selectedFolderFromList,
  type FolderSelection,
} from "../components/folders/FolderControls";
import {
  PROJECT_FOLDER_PARAM,
  PROJECT_VIEW_PARAM,
  filterProjectsByFolder,
  filterProjectsByView,
  folderRailResult,
  hasLeftProject,
  projectInvolvementMap,
  isProjectView,
  readStoredProjectView,
  storeProjectView,
  type ProjectView,
} from "../lib/project-views";

type ProjectSortField = "name" | "updated" | "created" | "targetDate";
type ProjectSortDir = "asc" | "desc";

const PROJECT_SORT_OPTIONS: Array<{ field: ProjectSortField; labelKey: string }> = [
  { field: "name", labelKey: "projects.sortOption.name" },
  { field: "updated", labelKey: "projects.sortOption.updated" },
  { field: "created", labelKey: "projects.sortOption.created" },
  { field: "targetDate", labelKey: "projects.sortOption.targetDate" },
];

function compareProjectNames(left: Project, right: Project) {
  const nameDiff = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  return nameDiff !== 0 ? nameDiff : left.id.localeCompare(right.id);
}

function projectTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function compareOptionalTime(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined,
  sortDir: ProjectSortDir,
) {
  const leftTime = projectTime(left);
  const rightTime = projectTime(right);
  if (leftTime === null && rightTime === null) return 0;
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;
  return sortDir === "asc" ? leftTime - rightTime : rightTime - leftTime;
}

function sortProjects(projects: Project[], sortField: ProjectSortField, sortDir: ProjectSortDir) {
  return [...projects].sort((left, right) => {
    let comparison = 0;
    if (sortField === "name") {
      comparison = compareProjectNames(left, right);
      return sortDir === "asc" ? comparison : -comparison;
    }

    if (sortField === "updated") comparison = compareOptionalTime(left.updatedAt, right.updatedAt, sortDir);
    else if (sortField === "created") comparison = compareOptionalTime(left.createdAt, right.createdAt, sortDir);
    else comparison = compareOptionalTime(left.targetDate, right.targetDate, sortDir);

    if (comparison === 0) comparison = compareProjectNames(left, right);
    return comparison;
  });
}

function stopRowNavigation(event: MouseEvent) {
  // The row is a link; menu clicks (including portalled items) must not navigate.
  event.preventDefault();
  event.stopPropagation();
}

export function Projects() {
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { openNewProject } = useDialogActions();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sortField, setSortField] = useState<ProjectSortField>("name");
  const [sortDir, setSortDir] = useState<ProjectSortDir>("asc");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogTarget, setFolderDialogTarget] = useState<FolderListItem | null>(null);
  const [folderDialogParentId, setFolderDialogParentId] = useState<string | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderListItem | null>(null);
  const [moveAfterCreateId, setMoveAfterCreateId] = useState<string | null>(null);
  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);

  const viewParam = searchParams.get(PROJECT_VIEW_PARAM);
  const view: ProjectView = isProjectView(viewParam) ? viewParam : (readStoredProjectView() ?? "mine");
  const folderSelection = normalizeFolderSelection(searchParams.get(PROJECT_FOLDER_PARAM));

  function setView(next: ProjectView) {
    storeProjectView(next);
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set(PROJECT_VIEW_PARAM, next);
      return params;
    });
  }

  function setFolderSelection(selection: FolderSelection) {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      const value = folderSearchValue(selection);
      if (value) params.set(PROJECT_FOLDER_PARAM, value);
      else params.delete(PROJECT_FOLDER_PARAM);
      return params;
    });
  }

  useEffect(() => {
    setBreadcrumbs([{ label: t("projects.title") }]);
  }, [setBreadcrumbs, t]);

  const { data: allProjects, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: projectFolders, isLoading: foldersLoading } = useQuery({
    queryKey: queryKeys.folders.list(selectedCompanyId!, "project"),
    queryFn: () => foldersApi.list(selectedCompanyId!, "project"),
    enabled: !!selectedCompanyId,
  });
  const { data: session } = useQuery({ queryKey: queryKeys.auth.session, queryFn: () => authApi.getSession() });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const mineQuery = useQuery({
    queryKey: queryKeys.projects.mine(selectedCompanyId!, currentUserId),
    queryFn: () => projectsApi.mine(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: companyMembers } = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId!),
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const userLabelMap = useMemo(() => buildCompanyUserLabelMap(companyMembers?.users), [companyMembers?.users]);
  const membershipsQuery = useResourceMemberships(selectedCompanyId);
  const membershipMutation = useResourceMembershipMutation(selectedCompanyId);
  const projects = useMemo(
    () => allProjects ?? [],
    [allProjects],
  );
  // Ignore an answer for another person (a sign-in change while the request was in flight).
  const involvement = useMemo(
    () => mineQuery.data && (!currentUserId || mineQuery.data.userId === currentUserId) ? projectInvolvementMap(mineQuery.data) : null,
    [currentUserId, mineQuery.data],
  );
  const viewProjects = useMemo(
    () => filterProjectsByView(projects, involvement, view),
    [involvement, projects, view],
  );
  const folderList = projectFolders?.folders ?? [];
  const railResult = useMemo(() => folderRailResult(projectFolders, viewProjects), [projectFolders, viewProjects]);
  const sortedProjects = useMemo(
    () => sortProjects(filterProjectsByFolder(viewProjects, folderSelection, projectFolders?.folders ?? []), sortField, sortDir),
    [folderSelection, projectFolders?.folders, sortDir, sortField, viewProjects],
  );

  function personLabel(userId: string) {
    return userId === currentUserId ? t("projects.attribution.you") : formatUserLabel(userId, userLabelMap) ?? t("projects.attribution.unknownPerson");
  }

  /** "Created by …" for a project or folder; unknown when nothing was recorded. */
  function createdByLabel(record: Parameters<typeof deriveCreationAttribution>[0]) {
    const { creator, requestedBy } = deriveCreationAttribution(record);
    if (!creator) return t("projects.attribution.unknown");
    if (creator.kind === "user") return t("projects.attribution.createdBy", { name: personLabel(creator.id) });
    const agent = agents?.find((entry) => entry.id === creator.id)?.name ?? t("projects.attribution.unknownAgent");
    return requestedBy
      ? t("projects.attribution.createdByAgentFor", { agent, name: personLabel(requestedBy.userId) })
      : t("projects.attribution.createdByAgent", { agent });
  }

  function reasonsLabel(reasons: ProjectInvolvementReason[] | undefined) {
    return (reasons ?? []).map((reason) => t(`projects.reason.${reason}`)).join(" · ");
  }
  const activeFolder = selectedFolderFromList(folderList, folderSelection);

  async function refreshFolders() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(selectedCompanyId!) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.list(selectedCompanyId!, "project") }),
    ]);
  }

  function errorBody(error: unknown) {
    return error instanceof Error ? error.message : undefined;
  }

  const moveProject = useMutation({
    mutationFn: ({ projectId, folderId }: { projectId: string; folderId: string | null }) =>
      foldersApi.moveItem(selectedCompanyId!, { kind: "project", itemId: projectId, folderId }),
    onSuccess: async () => {
      await refreshFolders();
      pushToast({ title: t("projects.toast.moved"), tone: "success" });
    },
    onError: (error) => pushToast({ title: t("projects.toast.moveFailed"), body: errorBody(error), tone: "error" }),
  });

  const createFolder = useMutation({
    mutationFn: (payload: { name: string; color: string | null; parentId?: string | null }) =>
      foldersApi.create(selectedCompanyId!, { kind: "project", ...payload }),
    onSuccess: async (folder) => {
      setFolderDialogOpen(false);
      const projectId = moveAfterCreateId;
      setMoveAfterCreateId(null);
      if (projectId) {
        try {
          await foldersApi.moveItem(selectedCompanyId!, { kind: "project", itemId: projectId, folderId: folder.id });
        } catch (error) {
          pushToast({ title: t("projects.toast.folderCreatedMoveFailed"), body: errorBody(error), tone: "error" });
        }
      }
      await refreshFolders();
      pushToast({ title: t("projects.toast.folderCreated"), body: folder.name, tone: "success" });
    },
    onError: (error) => pushToast({ title: t("projects.toast.folderSaveFailed"), body: errorBody(error), tone: "error" }),
  });

  const updateFolder = useMutation({
    mutationFn: async ({ folderId, payload }: { folderId: string; payload: { name?: string; color?: string | null; parentId?: string | null } }) => {
      const { parentId, ...fields } = payload;
      const current = folderList.find((folder) => folder.id === folderId);
      // Moving under another folder keeps its projects and their access as they are.
      if (parentId !== undefined && current && (current.parentId ?? null) !== parentId) {
        const siblings = folderList.filter((folder) => (folder.parentId ?? null) === parentId && folder.id !== folderId);
        await foldersApi.moveFolder(selectedCompanyId!, folderId, { parentId, position: siblings.length });
      }
      return foldersApi.update(selectedCompanyId!, folderId, fields);
    },
    onSuccess: async () => {
      setFolderDialogOpen(false);
      await refreshFolders();
    },
    onError: (error) => pushToast({ title: t("projects.toast.folderUpdateFailed"), body: errorBody(error), tone: "error" }),
  });

  const deleteFolder = useMutation({
    mutationFn: (folderId: string) => foldersApi.delete(selectedCompanyId!, folderId),
    onSuccess: async (_, folderId) => {
      if (folderSelection === folderId) setFolderSelection("all");
      setDeleteFolderTarget(null);
      await refreshFolders();
      pushToast({ title: t("projects.toast.folderDeleted"), body: t("projects.toast.folderDeletedBody"), tone: "success" });
    },
    onError: (error) => pushToast({ title: t("projects.toast.folderDeleteFailed"), body: errorBody(error), tone: "error" }),
  });

  function openCreateFolder(moveProjectId: string | null = null, parentId: string | null = null) {
    setMoveAfterCreateId(moveProjectId);
    setFolderDialogTarget(null);
    setFolderDialogParentId(parentId);
    setFolderDialogOpen(true);
  }

  function requestDeleteFolder(folder: FolderListItem) {
    // The server keeps a folder that still has subfolders; say so before asking.
    if (folderList.some((entry) => entry.parentId === folder.id)) {
      pushToast({ title: t("projects.toast.folderHasSubfolders"), body: folder.name, tone: "error" });
      return;
    }
    setDeleteFolderTarget(folder);
  }

  const sortLabel = t(PROJECT_SORT_OPTIONS.find((option) => option.field === sortField)?.labelKey ?? "projects.sortOption.name");

  if (!selectedCompanyId) {
    return <EmptyState icon={Hexagon} message={t("projects.selectOrg")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-md border border-border" role="group" aria-label={t("projects.view.label")}>
            {(["mine", "all"] as const).map((option, index) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={view === option ? "secondary" : "ghost"}
                className={index === 0 ? "rounded-none" : "rounded-none border-l border-border"}
                onClick={() => setView(option)}
                aria-pressed={view === option}
                title={t(option === "mine" ? "projects.view.mineHint" : "projects.view.allHint")}
              >
                {t(option === "mine" ? "projects.view.mine" : "projects.view.all")}
              </Button>
            ))}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="w-fit text-xs" title={t("projects.sortTitle")}>
                <ArrowUpDown className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                <span>{t("projects.sort", { label: sortLabel })}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-44 p-0">
              <div className="p-2 space-y-0.5">
                {PROJECT_SORT_OPTIONS.map((option) => (
                  <button
                    key={option.field}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm ${
                      sortField === option.field
                        ? "bg-accent/50 text-foreground"
                        : "text-muted-foreground hover:bg-accent/50"
                    }`}
                    onClick={() => {
                      if (sortField === option.field) {
                        setSortDir((current) => (current === "asc" ? "desc" : "asc"));
                        return;
                      }
                      setSortField(option.field);
                      setSortDir(option.field === "name" || option.field === "targetDate" ? "asc" : "desc");
                    }}
                  >
                    <span>{t(option.labelKey)}</span>
                    {sortField === option.field ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Check className="h-3 w-3" />
                        {sortDir === "asc" ? t("projects.sortAsc") : t("projects.sortDesc")}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Button size="sm" variant="outline" onClick={openNewProject}>
          <Plus className="h-4 w-4 mr-1" />
          {t("projects.addProject")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="projects-view-description">
        {t(view === "mine" ? "projects.view.mineDescription" : "projects.view.allDescription")}
      </p>
      {view === "mine" && mineQuery.error ? (
        <p className="text-sm text-destructive">{t("projects.view.mineError", { message: mineQuery.error.message })}</p>
      ) : null}

      {projects.length > 0 ? (
        <div className="md:hidden">
          <FolderChip
            result={railResult}
            selection={folderSelection}
            allLabel={t("projects.allFolder")}
            onClick={() => setMobileFoldersOpen(true)}
          />
        </div>
      ) : null}

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!isLoading && projects.length === 0 && (
        <EmptyState
          icon={Hexagon}
          message={t("projects.empty")}
          action={t("projects.addProject")}
          onAction={openNewProject}
        />
      )}

      {projects.length > 0 && (
        <div className="flex gap-4">
          <FolderRail
            result={railResult}
            selection={folderSelection}
            allLabel={t("projects.allFolder")}
            itemLabelPlural={t("projects.itemsPlural")}
            loading={foldersLoading}
            onSelect={setFolderSelection}
            onCreate={() => openCreateFolder()}
            onRename={(folder, name) => updateFolder.mutate({ folderId: folder.id, payload: { name } })}
            onEdit={(folder) => {
              setFolderDialogTarget(folder);
              setFolderDialogOpen(true);
            }}
            onDelete={requestDeleteFolder}
            nested
            onCreateChild={(folder) => openCreateFolder(null, folder.id)}
            describeFolder={createdByLabel}
          />
          <section className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium">
                {activeFolder ? <FolderSwatch color={activeFolder.color} /> : null}
                <span className="truncate">
                  {folderSelection === "all"
                    ? t(view === "mine" ? "projects.view.mine" : "projects.view.all")
                    : folderSelection === "unfiled"
                      ? t("folders.unfiled")
                      : activeFolder?.name ?? t("projects.unknownFolder")}
                </span>
              </h2>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {activeFolder ? (
                  <span className="hidden truncate sm:inline" data-testid="projects-folder-created-by">{createdByLabel(activeFolder)}</span>
                ) : null}
                <span>{t("projects.count", { count: sortedProjects.length })}</span>
              </span>
            </div>
            {sortedProjects.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                {view === "mine" && mineQuery.isLoading
                  ? t("projects.view.mineLoading")
                  : folderSelection === "all" && view === "mine" ? t("projects.view.mineEmpty") : t("projects.folderEmpty")}
              </p>
            ) : (
              <Card className="block py-0 overflow-hidden divide-y divide-border">
                {sortedProjects.map((project) => {
                  const state = resourceMembershipState(membershipsQuery.data, "project", project.id);
                  const pending = membershipMutation.isPending &&
                    membershipMutation.variables?.resourceType === "project" &&
                    membershipMutation.variables.resourceId === project.id;
                  const starPending = pending && membershipMutation.variables?.starred !== undefined;
                  const joinLeavePending = pending && membershipMutation.variables?.starred === undefined;
                  const starred = isStarred(membershipsQuery.data, "project", project.id);
                  return (
                    <EntityRow
                      key={project.id}
                      leading={<ProjectTile color={project.color ?? null} icon={project.icon ?? null} size="sm" />}
                      title={project.name}
                      subtitle={project.description ?? undefined}
                      reserveSubtitleSpace
                      to={projectUrl(project)}
                      className={hasLeftProject(membershipsQuery.data, project.id) ? "group text-foreground/55" : "group"}
                      trailing={
                        <div className="flex items-center gap-3">
                          {project.visibility === "private" ? <Lock className="size-4 shrink-0 text-muted-foreground" aria-label={t("projects.privateProject")} /> : null}
                          <span className="hidden max-w-xs truncate text-xs text-muted-foreground lg:inline" data-testid="project-row-relation">
                            {view === "mine" ? reasonsLabel(involvement?.get(project.id)) : createdByLabel(project)}
                          </span>
                          <span
                            className="hidden text-xs text-muted-foreground tabular-nums sm:inline"
                            title={t("projects.taskCount", { count: project.taskCount ?? 0, formattedCount: formatNumber(project.taskCount ?? 0) })}
                          >
                            {t("projects.taskCount", { count: project.taskCount ?? 0, formattedCount: formatNumber(project.taskCount ?? 0) })}
                          </span>
                          {project.budget && (
                            <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                              {formatProjectBudget(project.budget)}
                            </span>
                          )}
                          {project.targetDate && (
                            <span className="hidden text-xs text-muted-foreground md:inline">
                              {formatDate(project.targetDate)}
                            </span>
                          )}
                          <StatusBadge status={project.status} />
                          <span onClick={stopRowNavigation}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-6 w-6"
                                  aria-label={t("projects.actions", { name: project.name })}
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <MoveToMenu
                                  folders={folderList}
                                  currentFolderId={project.folderId ?? null}
                                  onMove={(folderId) => moveProject.mutate({ projectId: project.id, folderId })}
                                  onCreateAndMove={() => openCreateFolder(project.id)}
                                />
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </span>
                          <MembershipAction
                            state={state}
                            pending={joinLeavePending}
                            pendingState={joinLeavePending ? membershipMutation.variables?.state : null}
                            resourceName={project.name}
                            onJoin={() => membershipMutation.mutate({
                              resourceType: "project",
                              resourceId: project.id,
                              resourceName: project.name,
                              state: "joined",
                            })}
                            onLeave={() => membershipMutation.mutate({
                              resourceType: "project",
                              resourceId: project.id,
                              resourceName: project.name,
                              state: "left",
                            })}
                          />
                          <StarToggle
                            size="row"
                            starred={starred}
                            pending={starPending}
                            resourceName={project.name}
                            onToggle={(next) => membershipMutation.mutate({
                              resourceType: "project",
                              resourceId: project.id,
                              resourceName: project.name,
                              starred: next,
                            })}
                          />
                        </div>
                      }
                    />
                  );
                })}
              </Card>
            )}
          </section>
        </div>
      )}

      <FolderFormDialog
        open={folderDialogOpen}
        kind="project"
        folder={folderDialogTarget}
        parentOptions={folderList}
        initialParentId={folderDialogParentId}
        pending={createFolder.isPending || updateFolder.isPending}
        onOpenChange={(open) => {
          setFolderDialogOpen(open);
          if (!open) setMoveAfterCreateId(null);
        }}
        onSubmit={(payload) => {
          if (folderDialogTarget) updateFolder.mutate({ folderId: folderDialogTarget.id, payload });
          else createFolder.mutate(payload);
        }}
      />
      <DeleteFolderDialog
        open={deleteFolderTarget !== null}
        folder={deleteFolderTarget}
        itemLabelPlural={t("projects.itemsPlural")}
        pending={deleteFolder.isPending}
        onOpenChange={(open) => {
          if (!open) setDeleteFolderTarget(null);
        }}
        onConfirm={() => {
          if (deleteFolderTarget) deleteFolder.mutate(deleteFolderTarget.id);
        }}
      />
      <MobileFolderSheet
        open={mobileFoldersOpen}
        onOpenChange={setMobileFoldersOpen}
        result={railResult}
        selection={folderSelection}
        allLabel={t("projects.allFolder")}
        itemLabelPlural={t("projects.itemsPlural")}
        onSelect={setFolderSelection}
        onCreate={() => {
          setMobileFoldersOpen(false);
          openCreateFolder();
        }}
      />
    </div>
  );
}
