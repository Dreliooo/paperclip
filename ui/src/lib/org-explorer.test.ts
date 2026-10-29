import { describe, expect, it } from "vitest";
import {
  ancestorIds,
  defaultExpandedIds,
  directReports,
  indexOrgTree,
  orgPath,
  searchOrg,
  teamStatusSummary,
  visibleOrgRows,
  type OrgTreeNode,
} from "./org-explorer";

function node(id: string, name: string, reports: OrgTreeNode[] = [], status = "idle", role = "engineer"): OrgTreeNode {
  return { id, name, role, status, reports };
}

// CEO with two managers; one manager has many reports (the wide case).
const engineers = Array.from({ length: 40 }, (_, i) =>
  node(`eng-${i}`, `Engineer ${String(i).padStart(2, "0")}`, [], i % 10 === 0 ? "error" : "running"),
);
const tree = [
  node("ceo", "Ana CEO", [
    node("cto", "Bruno CTO", engineers, "running", "cto"),
    node("cmo", "Carla Marketing", [node("writer", "Diego Redactor", [], "paused", "designer")], "idle", "cmo"),
  ], "running", "ceo"),
];

describe("org explorer helpers", () => {
  const index = indexOrgTree(tree);

  it("indexes depth, parents and team size", () => {
    expect(index.byId.get("ceo")).toMatchObject({ depth: 0, parentId: null, descendantCount: 43 });
    expect(index.byId.get("cto")).toMatchObject({ depth: 1, parentId: "ceo", descendantCount: 40 });
    expect(index.byId.get("eng-3")).toMatchObject({ depth: 2, parentId: "cto", descendantCount: 0 });
  });

  it("builds the chain of command", () => {
    expect(orgPath(index, "writer").map((entry) => entry.node.id)).toEqual(["ceo", "cmo", "writer"]);
    expect(orgPath(index, "missing")).toEqual([]);
  });

  it("lists direct reports sorted by name, or the roots", () => {
    expect(directReports(index, "ceo").map((child) => child.id)).toEqual(["cto", "cmo"]);
    expect(directReports(index, null).map((root) => root.id)).toEqual(["ceo"]);
  });

  it("starts with leadership open and large teams collapsed", () => {
    const expanded = defaultExpandedIds(index);
    expect([...expanded]).toEqual(["ceo"]);
    const rows = visibleOrgRows(index, expanded);
    expect(rows.map((row) => row.id)).toEqual(["ceo", "cto", "cmo"]);
    expect(rows[1]).toMatchObject({ hasChildren: true, expanded: false, descendantCount: 40 });
  });

  it("searches name, role and title without accents or case", () => {
    expect(searchOrg(index, "redactor")).toEqual(["writer"]);
    expect(searchOrg(index, "CARLA")).toEqual(["cmo"]);
    expect(searchOrg(index, "lider", (id) => (id === "cto" ? { title: "Líder técnico" } : {}))).toEqual(["cto"]);
    expect(searchOrg(index, "engineer 07")).toEqual(["eng-7"]);
    // Every term must match somewhere (role "engineer" + "0" in the name).
    expect(searchOrg(index, "engineer 0")).toHaveLength(13);
    expect(searchOrg(index, "   ")).toEqual([]);
  });

  it("shows search matches with their ancestors forced open", () => {
    const matches = searchOrg(index, "Engineer 07");
    const rows = visibleOrgRows(index, new Set(), matches);
    expect(rows.map((row) => [row.id, row.contextOnly])).toEqual([
      ["ceo", true],
      ["cto", true],
      ["eng-7", false],
    ]);
    expect([...ancestorIds(index, matches)].sort()).toEqual(["ceo", "cto"]);
  });

  it("summarises team status", () => {
    expect(teamStatusSummary(index, "cto")).toEqual({ total: 41, byStatus: { running: 37, error: 4 } });
  });

  it("survives a reporting cycle", () => {
    const a = node("a", "A");
    const b = node("b", "B", [a]);
    a.reports.push(b);
    const cyclic = indexOrgTree([a]);
    expect(cyclic.order).toEqual(["a", "b"]);
    expect(orgPath(cyclic, "b").map((entry) => entry.node.id)).toEqual(["a", "b"]);
  });
});
