import type {
  Folder,
  FolderListResult,
  MyProjectsResult,
  Project,
  ProjectInvolvementReason,
  ResourceMemberships,
} from "@paperclipai/shared";
import type { FolderSelection } from "../components/folders/FolderControls";

/**
 * Projects page views:
 *   - `mine`: projects related to the viewer, computed by the server
 *     (`GET /companies/:id/projects/mine`): created or requested by them,
 *     shared with them privately, with tasks of theirs, followed, or their
 *     personal project. A project they left is not included.
 *   - `all`:  every project the server returned, i.e. every project the viewer
 *     is allowed to read. Private projects never reach the client otherwise.
 */
export const PROJECT_VIEWS = ["mine", "all"] as const;
export type ProjectView = (typeof PROJECT_VIEWS)[number];

export const PROJECT_VIEW_PARAM = "view";
export const PROJECT_FOLDER_PARAM = "folder";
export const PROJECT_LAST_VIEW_KEY = "paperclip:projects:last-view";

export function isProjectView(value: unknown): value is ProjectView {
  return typeof value === "string" && (PROJECT_VIEWS as readonly string[]).includes(value);
}

export function hasLeftProject(memberships: ResourceMemberships | undefined, projectId: string): boolean {
  return memberships?.projectMemberships[projectId] === "left";
}

export function projectInvolvementMap(result: MyProjectsResult | undefined) {
  return new Map((result?.projects ?? []).map((entry) => [entry.projectId, entry.reasons]));
}

/** `mine` shows nothing until the server answers, so it never flashes the full list. */
export function filterProjectsByView(
  projects: Project[],
  involvement: Map<string, ProjectInvolvementReason[]> | null,
  view: ProjectView,
): Project[] {
  if (view === "all") return projects;
  if (!involvement) return [];
  return projects.filter((project) => involvement.has(project.id));
}

/** A folder and all of its subfolders. */
export function folderWithDescendants(folders: Pick<Folder, "id" | "parentId">[], folderId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder.id]);
  }
  const ids = new Set<string>();
  const pending = [folderId];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return ids;
}

/** Selecting a folder shows its projects and those in its subfolders. */
export function filterProjectsByFolder(
  projects: Project[],
  selection: FolderSelection,
  folders: Pick<Folder, "id" | "parentId">[] = [],
): Project[] {
  if (selection === "all") return projects;
  if (selection === "unfiled") return projects.filter((project) => !project.folderId);
  const ids = folderWithDescendants(folders, selection);
  return projects.filter((project) => project.folderId != null && ids.has(project.folderId));
}

/** Folder counts for what this view shows, including subfolders, so the rail always matches the list. */
export function folderRailResult(result: FolderListResult | undefined, projects: Project[]): FolderListResult | undefined {
  if (!result) return undefined;
  const direct = new Map<string | null, number>();
  for (const project of projects) {
    const key = project.folderId ?? null;
    direct.set(key, (direct.get(key) ?? 0) + 1);
  }
  return {
    ...result,
    folders: result.folders.map((folder) => {
      let itemCount = 0;
      for (const id of folderWithDescendants(result.folders, folder.id)) itemCount += direct.get(id) ?? 0;
      return { ...folder, itemCount };
    }),
    allCount: projects.length,
    unfiledCount: direct.get(null) ?? 0,
  };
}

export function readStoredProjectView(): ProjectView | null {
  try {
    const stored = window.localStorage.getItem(PROJECT_LAST_VIEW_KEY);
    return isProjectView(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeProjectView(view: ProjectView) {
  try {
    window.localStorage.setItem(PROJECT_LAST_VIEW_KEY, view);
  } catch {
    // Storage can be unavailable (private windows); the URL still carries the view.
  }
}
