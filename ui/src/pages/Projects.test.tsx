// @vitest-environment jsdom

import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../context/ToastContext";
import { Projects } from "./Projects";

const mockProjectsApi = vi.hoisted(() => ({
  list: vi.fn(),
  mine: vi.fn(),
}));

const mockAuthApi = vi.hoisted(() => ({ getSession: vi.fn() }));
const mockAccessApi = vi.hoisted(() => ({ listUserDirectory: vi.fn() }));
const mockAgentsApi = vi.hoisted(() => ({ list: vi.fn() }));

const mockResourceMembershipsApi = vi.hoisted(() => ({
  listMine: vi.fn(),
  updateProject: vi.fn(),
}));

const mockFoldersApi = vi.hoisted(() => ({
  list: vi.fn(),
  moveItem: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

const mockOpenNewProject = vi.hoisted(() => vi.fn());
const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/router", async () => {
  const React = await import("react");
  type Next = URLSearchParams | ((current: URLSearchParams) => URLSearchParams);
  return {
    Link: ({ children, to, ...props }: { children?: ReactNode; to: string }) => (
      <a href={to} {...props}>{children}</a>
    ),
    useSearchParams: () => {
      const [params, setParams] = React.useState(() => new URLSearchParams());
      const update = (next: Next) =>
        setParams((current) => new URLSearchParams(typeof next === "function" ? next(current) : next));
      return [params, update] as const;
    },
  };
});

vi.mock("../api/folders", () => ({
  foldersApi: mockFoldersApi,
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../context/DialogContext", () => ({
  useDialogActions: () => ({ openNewProject: mockOpenNewProject }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: mockSetBreadcrumbs }),
}));

vi.mock("../api/projects", () => ({
  projectsApi: mockProjectsApi,
}));

vi.mock("../api/resourceMemberships", () => ({
  resourceMembershipsApi: mockResourceMembershipsApi,
}));

vi.mock("../api/auth", () => ({ authApi: mockAuthApi }));
vi.mock("../api/access", () => ({ accessApi: mockAccessApi }));
vi.mock("../api/agents", () => ({ agentsApi: mockAgentsApi }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (!globalThis.PointerEvent) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).PointerEvent = MouseEvent;
}

async function act(callback: () => void | Promise<void>) {
  let result: void | Promise<void> = undefined;
  flushSync(() => {
    result = callback();
  });
  await result;
}

function makeProject(overrides: Partial<Project>): Project {
  return {
    id: "project-a",
    companyId: "company-1",
    urlKey: "alpha",
    goalId: null,
    goalIds: [],
    goals: [],
    name: "Alpha",
    description: null,
    status: "in_progress",
    leadAgentId: null,
    targetDate: null,
    color: "#ef4444",
    icon: null,
    env: null,
    pauseReason: null,
    pausedAt: null,
    executionWorkspacePolicy: null,
    codebase: {
      workspaceId: null,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
      repoName: null,
      localFolder: null,
      managedFolder: "/tmp/project-a",
      effectiveLocalFolder: "/tmp/project-a",
      origin: "local_folder",
    },
    workspaces: [],
    primaryWorkspace: null,
    managedByPlugin: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("Projects", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mockProjectsApi.list.mockResolvedValue([
      makeProject({
        id: "project-c",
        urlKey: "charlie",
        name: "Charlie",
        folderId: "folder-clients",
        updatedAt: new Date("2026-01-10T00:00:00Z"),
      }),
      makeProject({
        id: "project-b",
        urlKey: "bravo",
        name: "Bravo",
        updatedAt: new Date("2026-01-05T00:00:00Z"),
      }),
      makeProject({
        id: "project-a",
        urlKey: "alpha",
        name: "Alpha",
        description: "First project",
        createdByUserId: "u-ana",
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ]);
    mockAuthApi.getSession.mockResolvedValue({ user: { id: "u-ana" }, session: { userId: "u-ana" } });
    mockAccessApi.listUserDirectory.mockResolvedValue({ users: [] });
    mockAgentsApi.list.mockResolvedValue([{ id: "agent-1", name: "Director" }]);
    // Fictional people: Ana created Alpha and has a task in Charlie; Beto created Bravo.
    mockProjectsApi.mine.mockImplementation(async () => {
      const session = await mockAuthApi.getSession();
      return session?.user?.id === "u-beto"
        ? { userId: "u-beto", projects: [{ projectId: "project-b", reasons: ["created"] }] }
        : {
          userId: "u-ana",
          projects: [
            { projectId: "project-a", reasons: ["created"] },
            { projectId: "project-c", reasons: ["tasks"] },
          ],
        };
    });
    mockResourceMembershipsApi.listMine.mockResolvedValue({
      projectMemberships: { "project-b": "left" },
      agentMemberships: {},
      updatedAt: null,
    });
    window.localStorage.clear();
    mockFoldersApi.list.mockResolvedValue({
      kind: "project",
      folders: [{
        id: "folder-clients",
        companyId: "company-1",
        kind: "project",
        parentId: null,
        name: "Clients",
        slug: "clients",
        systemKey: null,
        path: "clients",
        depth: 1,
        color: "emerald",
        position: 0,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        itemCount: 1,
      }],
      allCount: 3,
      unfiledCount: 2,
    });
    mockFoldersApi.moveItem.mockResolvedValue({ kind: "project", itemId: "project-c", folderId: null });
    mockResourceMembershipsApi.updateProject.mockResolvedValue({
      resourceType: "project",
      resourceId: "project-b",
      state: "joined",
      updatedAt: new Date("2026-01-05T00:00:00Z"),
    });
  });

  afterEach(async () => {
    const currentRoot = root;
    if (currentRoot) {
      await act(async () => {
        currentRoot.unmount();
      });
    }
    queryClient.clear();
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  async function renderProjects() {
    const currentRoot = createRoot(container);
    root = currentRoot;

    await act(async () => {
      currentRoot.render(
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <Projects />
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();
  }

  async function openSortMenu() {
    const trigger = container.querySelector<HTMLButtonElement>('button[title="Sort"]');
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();
  }

  async function chooseSortField(label: string) {
    const item = Array.from(document.body.querySelectorAll("button"))
      .find((element) => element.textContent?.includes(label));
    expect(item).toBeTruthy();

    await act(async () => {
      item?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();
  }

  async function click(element: Element | null | undefined) {
    expect(element).toBeTruthy();
    await act(async () => {
      element?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();
  }

  function buttonWithText(text: string, root: ParentNode = container) {
    return Array.from(root.querySelectorAll("button")).find((element) => element.textContent?.trim().startsWith(text));
  }

  it("shows my projects by default, from the server, sorted by name, with reasons", async () => {
    await renderProjects();

    const content = container.textContent ?? "";
    expect(container.querySelector('button[title="Sort"]')?.textContent).toContain("Sort: Name");
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("My projects");
    expect(content.indexOf("Alpha")).toBeLessThan(content.indexOf("Charlie"));
    expect(content).not.toContain("Bravo");
    expect(content).toContain("in progress");
    expect(container.querySelector('[data-testid="projects-view-description"]')?.textContent).toContain("My projects:");
    const relations = Array.from(container.querySelectorAll('[data-testid="project-row-relation"]')).map((node) => node.textContent);
    expect(relations).toEqual(["Created by you", "Your tasks"]);
  });

  it("shows a different list to another person, never the previous person's cached list", async () => {
    await renderProjects();
    expect(container.textContent).toContain("Alpha");

    mockAuthApi.getSession.mockResolvedValue({ user: { id: "u-beto" }, session: { userId: "u-beto" } });
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
    });
    await flushReact();
    await flushReact();

    const content = container.textContent ?? "";
    expect(content).toContain("Bravo");
    expect(content).not.toContain("Alpha");
    expect(content).not.toContain("Charlie");
  });

  it("shows who created each project in All projects", async () => {
    await renderProjects();
    await click(buttonWithText("All projects"));
    const relations = Array.from(container.querySelectorAll('[data-testid="project-row-relation"]')).map((node) => node.textContent);
    expect(relations).toEqual(["Created by you", "Creator unknown", "Creator unknown"]);
    expect(container.querySelector('[data-testid="projects-view-description"]')?.textContent).toContain("All projects:");
  });

  it("switches to all projects and keeps projects I left dimmed", async () => {
    await renderProjects();
    await click(buttonWithText("All projects"));

    const bravoLink = Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).find((link) =>
      link.textContent?.includes("Bravo"),
    );
    expect(bravoLink?.className).toContain("text-foreground/55");
    expect(window.localStorage.getItem("paperclip:projects:last-view")).toBe("all");
  });

  it("sorts projects by the selected field", async () => {
    await renderProjects();
    await openSortMenu();
    await chooseSortField("Updated");

    const content = container.textContent ?? "";
    expect(content.indexOf("Charlie")).toBeLessThan(content.indexOf("Alpha"));
  });

  it("filters by folder with counts that match the current view", async () => {
    await renderProjects();
    const rail = container.querySelector("nav");
    expect(rail?.textContent).toContain("Clients");

    await click(buttonWithText("Clients", rail!));
    const content = container.textContent ?? "";
    expect(content).toContain("Charlie");
    expect(content).not.toContain("Alpha");
  });

  it("shows subfolders indented and includes them when a parent folder is selected", async () => {
    const base = await mockFoldersApi.list();
    mockFoldersApi.list.mockResolvedValue({
      ...base,
      folders: [
        ...base.folders,
        { ...base.folders[0], id: "folder-north", parentId: "folder-clients", name: "North", slug: "north", path: "clients/north", depth: 2, createdByUserId: "u-ana" },
      ],
    });
    mockProjectsApi.list.mockResolvedValue([
      makeProject({ id: "project-a", name: "Alpha", folderId: "folder-north" }),
      makeProject({ id: "project-c", urlKey: "charlie", name: "Charlie", folderId: "folder-clients" }),
    ]);
    await renderProjects();
    const rail = container.querySelector("nav")!;
    const north = rail.querySelector('[data-folder-depth="2"]');
    expect(north?.textContent).toContain("North");
    expect(north?.className).toContain("pl-4");
    // Counts include subfolders: Clients holds Charlie plus North's Alpha.
    expect(buttonWithText("Clients", rail)?.parentElement?.textContent).toContain("2");

    await click(buttonWithText("Clients", rail));
    expect(container.textContent).toContain("Alpha");
    expect(container.textContent).toContain("Charlie");

    await click(buttonWithText("North", rail));
    expect(container.textContent).toContain("Alpha");
    expect(container.querySelector('[data-testid="projects-folder-created-by"]')?.textContent).toBe("Created by you");
  });

  it("moves a project to unfiled from its row menu", async () => {
    await renderProjects();
    await click(container.querySelector('button[aria-label="Project actions for Charlie"]'));
    await click(Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((item) => item.textContent?.includes("Move to")));
    await click(Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((item) => item.textContent?.trim() === "Unfiled"));

    expect(mockFoldersApi.moveItem).toHaveBeenCalledWith("company-1", { kind: "project", itemId: "project-c", folderId: null });
  });

  it("reserves description line height for projects without descriptions", async () => {
    await renderProjects();

    const charlieLink = Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).find((link) =>
      link.textContent?.includes("Charlie"),
    );
    const hiddenDescriptionLine = charlieLink?.querySelector("p[aria-hidden='true']");

    expect(hiddenDescriptionLine).not.toBeNull();
    expect(hiddenDescriptionLine?.className).toContain("min-h-4");
  });
});
