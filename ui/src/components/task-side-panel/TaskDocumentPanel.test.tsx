// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issuesApi } from "@/api/issues";
import { copyTextToClipboard } from "@/lib/clipboard";
import { downloadMarkdownFile } from "@/lib/document-download";
import { TaskDocumentPanel } from "./TaskDocumentPanel";

vi.mock("@/api/issues", () => ({ issuesApi: { getDocument: vi.fn() } }));
vi.mock("@/lib/clipboard", () => ({ copyTextToClipboard: vi.fn() }));
vi.mock("@/lib/document-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/document-download")>()),
  downloadMarkdownFile: vi.fn(),
}));
vi.mock("@/lib/router", () => ({ useLocation: () => ({ hash: "" }) }));
vi.mock("@/components/MarkdownBody", () => ({ MarkdownBody: ({ children }: { children: string }) => <div>{children}</div> }));
vi.mock("@/components/IssueDocumentAnnotations", () => ({
  DocumentAnnotationsCountChip: () => null,
  IssueDocumentAnnotations: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const planBody = "# Plan de migración\n\n- Paso 1: respaldar\n- Paso 2: migrar";
const doc = {
  id: "doc-1",
  key: "plan",
  title: "Plan de migración",
  body: planBody,
  latestRevisionNumber: 4,
  updatedAt: "2026-10-15T19:24:00Z",
} as never;

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let client: QueryClient;

function renderPanel() {
  act(() => root.render(
    <QueryClientProvider client={client}>
      <TaskDocumentPanel issueId="issue-1" documentKey="plan" initialDocument={doc} />
    </QueryClientProvider>,
  ));
}

function button(label: string) {
  return Array.from(container.querySelectorAll("button")).find((element) =>
    element.textContent?.includes(label) || element.getAttribute("aria-label") === label,
  ) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(issuesApi.getDocument).mockResolvedValue(doc);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
  container.remove();
});

describe("TaskDocumentPanel", () => {
  it("copies the whole plan in one click and confirms only after the write", async () => {
    vi.mocked(copyTextToClipboard).mockResolvedValue(undefined);
    renderPanel();
    await vi.waitFor(() => expect(button("Copy")).toBeTruthy());

    await act(async () => button("Copy")!.click());

    expect(copyTextToClipboard).toHaveBeenCalledWith(planBody);
    await vi.waitFor(() => expect(button("Copied")).toBeTruthy());
  });

  it("says so when the clipboard refuses the copy", async () => {
    vi.mocked(copyTextToClipboard).mockRejectedValue(new Error("blocked"));
    renderPanel();
    await vi.waitFor(() => expect(button("Copy")).toBeTruthy());

    await act(async () => button("Copy")!.click());

    await vi.waitFor(() => expect(button("Couldn't copy")).toBeTruthy());
    expect(button("Copied")).toBeUndefined();
  });

  it("downloads the plan as a Markdown file named after its title", async () => {
    renderPanel();
    await vi.waitFor(() => expect(button("Download")).toBeTruthy());

    act(() => button("Download")!.click());

    expect(downloadMarkdownFile).toHaveBeenCalledWith("plan-de-migracion.md", planBody);
  });
});
