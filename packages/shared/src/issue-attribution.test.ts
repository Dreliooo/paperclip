import { describe, expect, it } from "vitest";
import { deriveCreationAttribution, deriveOriginatingActor, deriveResponsibleUser } from "./issue-attribution.js";

describe("deriveResponsibleUser", () => {
  it("prefers an explicit responsible user", () => {
    expect(
      deriveResponsibleUser({
        responsibleUserId: "user-responsible",
        createdByUserId: "user-creator",
      }),
    ).toEqual({
      userId: "user-responsible",
      source: "explicit",
      isAutoDerived: false,
    });
  });

  it("falls back to the creator user as an auto-derived responsible user", () => {
    expect(
      deriveResponsibleUser({
        responsibleUserId: null,
        createdByUserId: "user-creator",
      }),
    ).toEqual({
      userId: "user-creator",
      source: "creator",
      isAutoDerived: true,
    });
  });

  it("returns none when no human is available", () => {
    expect(
      deriveResponsibleUser({
        responsibleUserId: null,
        createdByUserId: null,
      }),
    ).toEqual({
      userId: null,
      source: "none",
      isAutoDerived: false,
    });
  });
});

describe("deriveOriginatingActor", () => {
  it("prefers the human creator over an explicit responsible user", () => {
    expect(
      deriveOriginatingActor({
        createdByUserId: "user-creator",
        createdByAgentId: null,
        requestedByUserId: "user-requester",
      }),
    ).toEqual({ kind: "user", id: "user-creator" });
  });

  it("attributes an agent-created issue to the person who asked, via the agent", () => {
    expect(
      deriveOriginatingActor({
        createdByUserId: null,
        createdByAgentId: "agent-claude",
        requestedByUserId: "user-requester",
      }),
    ).toEqual({ kind: "user", id: "user-requester", viaAgentId: "agent-claude" });
  });

  it("keeps the creating agent when no request is proven, even with a responsible user", () => {
    expect(
      deriveOriginatingActor({
        createdByUserId: null,
        createdByAgentId: "agent-claude",
        requestedByUserId: null,
        responsibleUserId: "user-company-default",
      } as Parameters<typeof deriveOriginatingActor>[0]),
    ).toEqual({ kind: "agent", id: "agent-claude" });
  });

  it("does not treat the responsible user as originator when there is no creator", () => {
    expect(
      deriveOriginatingActor({
        createdByUserId: null,
        createdByAgentId: null,
        requestedByUserId: null,
        responsibleUserId: "user-responsible",
      } as Parameters<typeof deriveOriginatingActor>[0]),
    ).toBeNull();
  });

  it("returns null when nothing is attributable", () => {
    expect(
      deriveOriginatingActor({
        createdByUserId: null,
        createdByAgentId: null,
        requestedByUserId: null,
      }),
    ).toBeNull();
  });
});

describe("deriveCreationAttribution", () => {
  it("reports a person creator and no separate requester", () => {
    expect(deriveCreationAttribution({ createdByUserId: "u-ana", requestedByUserId: "u-beto" })).toEqual({
      creator: { kind: "user", id: "u-ana" },
      requestedBy: null,
      requestUnproven: false,
    });
  });

  it("reports the agent creator and the proven requester", () => {
    expect(deriveCreationAttribution({
      createdByAgentId: "agent-1",
      requestedByUserId: "u-beto",
      requestEvidence: "manual_wake",
    })).toEqual({
      creator: { kind: "agent", id: "agent-1" },
      requestedBy: { userId: "u-beto", evidence: "manual_wake" },
      requestUnproven: false,
    });
  });

  it("flags agent work without a proven request", () => {
    expect(deriveCreationAttribution({ createdByAgentId: "agent-1" })).toMatchObject({
      requestedBy: null,
      requestUnproven: true,
    });
  });

  it("returns an unknown creator for historical rows", () => {
    expect(deriveCreationAttribution({})).toEqual({ creator: null, requestedBy: null, requestUnproven: false });
  });
});
