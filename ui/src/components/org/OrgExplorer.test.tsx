// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@paperclipai/shared";
import type { OrgNode } from "../../api/agents";
import { OrgExplorer } from "./OrgExplorer";

const routerState = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("@/lib/router", () => ({
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; children?: ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useSearchParams: () => [
    routerState.params,
    (update: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => {
      routerState.params = typeof update === "function" ? update(routerState.params) : update;
    },
  ],
}));

vi.mock("@/components/AgentAvatar", () => ({ AgentAvatar: () => <span data-avatar /> }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function node(id: string, name: string, reports: OrgNode[] = [], status = "idle"): OrgNode {
  return { id, name, role: "engineer", status, reports };
}

const engineers = Array.from({ length: 40 }, (_, i) => node(`eng-${i}`, `Engineer ${String(i).padStart(2, "0")}`, [], "running"));
const tree: OrgNode[] = [
  node("ceo", "Ana CEO", [node("cto", "Bruno CTO", engineers), node("cmo", "Carla Marketing", [node("writer", "Diego Writer")])]),
];
const agents = [
  { id: "ceo", name: "Ana CEO", role: "ceo", title: "Chief Executive", urlKey: "ana-ceo" },
  { id: "cto", name: "Bruno CTO", role: "cto", title: "Head of Engineering", urlKey: "bruno-cto" },
] as unknown as Agent[];

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(<OrgExplorer orgTree={tree} agents={agents} />);
  });
}

describe("OrgExplorer", () => {
  beforeEach(() => {
    routerState.params = new URLSearchParams();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("opens on the leadership level instead of rendering all agents", () => {
    render();
    const rows = Array.from(container.querySelectorAll("[data-org-row]")).map((row) => row.getAttribute("data-org-row"));
    expect(rows).toEqual(["ceo", "cto", "cmo"]);
    // The single root is focused, its direct reports are readable cards.
    expect(container.querySelector('[data-testid="org-focus-card"]')?.textContent).toContain("Ana CEO");
    const reportCards = Array.from(container.querySelectorAll("[data-org-report]")).map((card) => card.getAttribute("data-org-report"));
    expect(reportCards).toEqual(["cto", "cmo"]);
    expect(container.querySelector('[data-org-report="cto"]')?.textContent).toContain("Head of Engineering");
  });

  it("drills into a team from a report card and shows the chain of command", () => {
    render();
    const viewTeam = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-org-report="cto"] button')).find((button) =>
      button.textContent?.includes("40"),
    );
    act(() => viewTeam?.click());
    expect(routerState.params.get("focus")).toBe("cto");
    render();
    expect(container.querySelector('[data-testid="org-focus-card"]')?.textContent).toContain("Bruno CTO");
    expect(container.querySelectorAll("[data-org-report]")).toHaveLength(40);
    expect(container.querySelector("nav")?.textContent).toContain("Ana CEO");
  });

  it("filters the hierarchy by search and keeps the path to each match", () => {
    render();
    const input = container.querySelector<HTMLInputElement>("input")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "writer");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const rows = Array.from(container.querySelectorAll("[data-org-row]")).map((row) => row.getAttribute("data-org-row"));
    expect(rows).toEqual(["ceo", "cmo", "writer"]);
  });

  it("expands and collapses a branch", () => {
    render();
    const expand = container.querySelector<HTMLButtonElement>('[data-org-row="cto"] button[aria-label^="Expand"]');
    act(() => expand?.click());
    expect(container.querySelectorAll("[data-org-row]").length).toBe(43);
    const collapse = container.querySelector<HTMLButtonElement>('[data-org-row="cto"] button[aria-label^="Collapse"]');
    act(() => collapse?.click());
    expect(container.querySelectorAll("[data-org-row]").length).toBe(3);
  });
});
