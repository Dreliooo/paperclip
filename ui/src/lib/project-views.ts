import type { Project, ResourceMemberships } from "@paperclipai/shared";
import type { FolderSelection } from "../components/folders/FolderControls";

/**
 * Projects page views, mirroring Tasks ("Mine" / "All tasks"):
 *   - `mine`: projects the viewer is part of. Everyone starts as part of every
 *     project they can see; leaving a project takes it off this list.
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

export function filterProjectsByView(
  projects: Project[],
  memberships: ResourceMemberships | undefined,
  view: ProjectView,
): Project[] {
  if (view === "all") return projects;
  return projects.filter((project) => !hasLeftProject(memberships, project.id));
}

export function filterProjectsByFolder(projects: Project[], selection: FolderSelection): Project[] {
  if (selection === "all") return projects;
  if (selection === "unfiled") return projects.filter((project) => !project.folderId);
  return projects.filter((project) => project.folderId === selection);
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
