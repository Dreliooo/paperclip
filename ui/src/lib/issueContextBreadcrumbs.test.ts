import { describe, expect, it } from "vitest";
import { buildIssueContextBreadcrumbs } from "./issueContextBreadcrumbs";

const fallback = { label: "Tasks", href: "/issues" };

describe("buildIssueContextBreadcrumbs", () => {
  it("leads with the task's project and links straight to it", () => {
    const crumbs = buildIssueContextBreadcrumbs({
      project: { id: "p1", name: "Website relaunch", href: "/projects/website-relaunch-p1" },
      parent: null,
      fallback,
    });
    expect(crumbs).toEqual([
      {
        kind: "project",
        label: "Website relaunch",
        href: "/projects/website-relaunch-p1",
        key: "project:p1",
      },
    ]);
  });

  it("keeps project › parent order for sub-tasks", () => {
    const crumbs = buildIssueContextBreadcrumbs({
      project: { id: "p1", name: "Website relaunch", href: "/projects/website-relaunch-p1" },
      parent: { id: "i1", identifier: "DEMO-12", title: "Design system" },
      fallback,
    });
    expect(crumbs.map((crumb) => crumb.kind)).toEqual(["project", "parent"]);
    expect(crumbs[1]).toMatchObject({ label: "Design system", identifier: "DEMO-12", href: "/issues/DEMO-12" });
  });

  it("falls back to the navigation source when the task has no project", () => {
    const crumbs = buildIssueContextBreadcrumbs({
      project: null,
      parent: null,
      fallback: { label: "Inbox", href: "/inbox/mine" },
    });
    expect(crumbs).toEqual([{ kind: "source", label: "Inbox", href: "/inbox/mine", key: "source:/inbox/mine" }]);
  });

  it("does not show an empty project label", () => {
    const crumbs = buildIssueContextBreadcrumbs({
      project: { id: "p1", name: "   ", href: "/projects/p1" },
      parent: null,
      fallback,
    });
    expect(crumbs[0]).toMatchObject({ kind: "source", label: "Tasks", href: "/issues" });
  });

  it("links a parent without identifier by id", () => {
    const crumbs = buildIssueContextBreadcrumbs({
      project: null,
      parent: { id: "abc", identifier: null, title: "Parent" },
      fallback,
    });
    expect(crumbs[1]).toMatchObject({ href: "/issues/abc", label: "Parent" });
    expect(crumbs[1]).not.toHaveProperty("identifier");
  });
});
