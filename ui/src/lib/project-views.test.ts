import { describe, expect, it } from "vitest";
import type { FolderListItem, FolderListResult, MyProjectsResult, Project } from "@paperclipai/shared";
import {
  filterProjectsByFolder,
  filterProjectsByView,
  folderRailResult,
  folderWithDescendants,
  isProjectView,
  projectInvolvementMap,
} from "./project-views";

function project(id: string, folderId: string | null = null): Project {
  return { id, name: id, folderId } as Project;
}

function folder(id: string, parentId: string | null = null): FolderListItem {
  return { id, parentId, name: id, itemCount: 0 } as FolderListItem;
}

describe("project views", () => {
  const projects = [project("mine-1", "f1"), project("theirs", "f1"), project("mine-2")];
  const mine: MyProjectsResult = {
    userId: "u-ana",
    projects: [
      { projectId: "mine-1", reasons: ["created"] },
      { projectId: "mine-2", reasons: ["tasks", "following"] },
    ],
  };

  it("keeps every readable project in the All view", () => {
    expect(filterProjectsByView(projects, projectInvolvementMap(mine), "all").map((p) => p.id))
      .toEqual(["mine-1", "theirs", "mine-2"]);
  });

  it("shows only the server's list in My projects, so the two views differ", () => {
    expect(filterProjectsByView(projects, projectInvolvementMap(mine), "mine").map((p) => p.id))
      .toEqual(["mine-1", "mine-2"]);
    expect(projectInvolvementMap(mine).get("mine-2")).toEqual(["tasks", "following"]);
  });

  it("shows nothing in My projects until the server answers", () => {
    expect(filterProjectsByView(projects, null, "mine")).toEqual([]);
    expect(filterProjectsByView(projects, projectInvolvementMap({ userId: "u-beto", projects: [] }), "mine")).toEqual([]);
  });

  it("filters by folder, unfiled and all", () => {
    expect(filterProjectsByFolder(projects, "all")).toHaveLength(3);
    expect(filterProjectsByFolder(projects, "unfiled").map((p) => p.id)).toEqual(["mine-2"]);
    expect(filterProjectsByFolder(projects, "f1").map((p) => p.id)).toEqual(["mine-1", "theirs"]);
    expect(filterProjectsByFolder(projects, "missing")).toEqual([]);
  });

  it("includes subfolders when a folder is selected", () => {
    const folders = [folder("clients"), folder("north", "clients"), folder("north-2026", "north"), folder("audits")];
    const nested = [project("a", "clients"), project("b", "north"), project("c", "north-2026"), project("d", "audits")];
    expect([...folderWithDescendants(folders, "clients")].sort()).toEqual(["clients", "north", "north-2026"]);
    expect(filterProjectsByFolder(nested, "clients", folders).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(filterProjectsByFolder(nested, "north", folders).map((p) => p.id)).toEqual(["b", "c"]);

    const result = { kind: "project", folders, allCount: 0, unfiledCount: 0 } as FolderListResult;
    const rail = folderRailResult(result, nested)!;
    expect(rail.folders.map((f) => [f.id, f.itemCount])).toEqual([
      ["clients", 3], ["north", 2], ["north-2026", 1], ["audits", 1],
    ]);
    expect(rail.allCount).toBe(4);
  });

  it("only accepts known views", () => {
    expect(isProjectView("mine")).toBe(true);
    expect(isProjectView("everything")).toBe(false);
    expect(isProjectView(null)).toBe(false);
  });
});
