import { describe, expect, it } from "vitest";
import type { Project, ResourceMemberships } from "@paperclipai/shared";
import { filterProjectsByFolder, filterProjectsByView, isProjectView } from "./project-views";

function project(id: string, folderId: string | null = null): Project {
  return { id, name: id, folderId } as Project;
}

const memberships = {
  projectMemberships: { left: "left", joined: "joined" },
  agentMemberships: {},
  starredDocumentIds: [],
} as unknown as ResourceMemberships;

describe("project views", () => {
  const projects = [project("joined", "f1"), project("left", "f1"), project("untouched")];

  it("keeps every readable project in the All view", () => {
    expect(filterProjectsByView(projects, memberships, "all").map((p) => p.id)).toEqual(["joined", "left", "untouched"]);
  });

  it("drops only projects the viewer left from My projects", () => {
    expect(filterProjectsByView(projects, memberships, "mine").map((p) => p.id)).toEqual(["joined", "untouched"]);
    expect(filterProjectsByView(projects, undefined, "mine")).toHaveLength(3);
  });

  it("filters by folder, unfiled and all", () => {
    expect(filterProjectsByFolder(projects, "all")).toHaveLength(3);
    expect(filterProjectsByFolder(projects, "unfiled").map((p) => p.id)).toEqual(["untouched"]);
    expect(filterProjectsByFolder(projects, "f1").map((p) => p.id)).toEqual(["joined", "left"]);
    expect(filterProjectsByFolder(projects, "missing")).toEqual([]);
  });

  it("only accepts known views", () => {
    expect(isProjectView("mine")).toBe(true);
    expect(isProjectView("everything")).toBe(false);
    expect(isProjectView(null)).toBe(false);
  });
});
