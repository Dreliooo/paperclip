// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreationAttributionFields } from "@paperclipai/shared";
import { CreationAttributionRows } from "./CreationAttributionRows";

vi.mock("@/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a>,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const users: Record<string, string> = { "u-ana": "Ana Pérez", "u-beto": "Beto Ruiz" };
const agents = [{ id: "agent-1", name: "Build Bot" }];

describe("CreationAttributionRows", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(record: CreationAttributionFields) {
    act(() => {
      root.render(
        <CreationAttributionRows
          record={record}
          entity="task"
          agents={agents}
          userLabel={(userId) => users[userId] ?? null}
          renderRow={(label, value, key) => (
            <div key={key} data-row={key}>
              <span>{label}</span>
              {value}
            </div>
          )}
        />,
      );
    });
  }

  function row(key: string) {
    return container.querySelector(`[data-row="${key}"]`) as HTMLElement | null;
  }

  it("shows the person who created the record and no requested row", () => {
    render({ createdByUserId: "u-ana" });

    expect(row("task-created-by")?.textContent).toContain("Ana Pérez");
    expect(row("task-requested-by")).toBeNull();
  });

  it("shows the creating agent with the requester and the evidence hint", () => {
    render({ createdByAgentId: "agent-1", requestedByUserId: "u-beto", requestEvidence: "message" });

    const created = row("task-created-by");
    expect(created?.textContent).toContain("Build Bot");
    expect(created?.textContent).toContain("attribution.agentSuffix");
    expect(created?.querySelector("a")?.getAttribute("href")).toBe("/agents/agent-1");

    const requested = row("task-requested-by");
    expect(requested?.textContent).toContain("Beto Ruiz");
    expect(requested?.textContent).toContain("attribution.evidence.message");
    expect(requested?.textContent).not.toContain("attribution.noEvidence");
  });

  it("uses the manual wake hint when the run was started by hand", () => {
    render({ createdByAgentId: "agent-1", requestedByUserId: "u-beto", requestEvidence: "manual_wake" });

    expect(row("task-requested-by")?.textContent).toContain("attribution.evidence.manualWake");
  });

  it("shows the no-evidence text when an agent created the record without a proven request", () => {
    render({ createdByAgentId: "agent-1" });

    const requested = row("task-requested-by");
    expect(requested?.textContent).toContain("attribution.noEvidence");
    expect(requested?.textContent).not.toContain("Beto Ruiz");
  });

  it("shows the unknown-creator text for a historical record with no creator", () => {
    render({});

    expect(row("task-created-by")?.textContent).toContain("attribution.unknownCreator");
    expect(row("task-requested-by")).toBeNull();
  });
});
