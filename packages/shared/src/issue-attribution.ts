import type { Issue } from "./types/issue.js";
import type { CreationRequestEvidence } from "./types/creation-attribution.js";

export type ResponsibleUserSource = "explicit" | "creator" | "none";

export interface ResponsibleUserAttribution {
  userId: string | null;
  source: ResponsibleUserSource;
  isAutoDerived: boolean;
}

export function deriveResponsibleUser(
  issue: Pick<Issue, "responsibleUserId" | "createdByUserId">,
): ResponsibleUserAttribution {
  if (issue.responsibleUserId) {
    return { userId: issue.responsibleUserId, source: "explicit", isAutoDerived: false };
  }

  if (issue.createdByUserId) {
    return { userId: issue.createdByUserId, source: "creator", isAutoDerived: true };
  }

  return { userId: null, source: "none", isAutoDerived: false };
}

/**
 * The actor to display as an issue's "Originating" attribution.
 *
 * A human creator always wins (`createdByUserId`). When an agent created the
 * issue and Paperclip has evidence of the person who asked for it
 * (`requestedByUserId`), we attribute the originator to that person and record
 * the creating agent as `viaAgentId` so the UI can show a "via <agent>"
 * affordance. Otherwise the agent itself is the originator.
 *
 * `responsibleUserId` is deliberately not used: it names the person runs act
 * on behalf of and can fall back to the company default, so it is not evidence
 * that the person asked for the task.
 */
export type OriginatingActor =
  | { kind: "user"; id: string; viaAgentId?: string }
  | { kind: "agent"; id: string };

export function deriveOriginatingActor(
  issue: Pick<Issue, "createdByUserId" | "createdByAgentId" | "requestedByUserId">,
): OriginatingActor | null {
  if (issue.createdByUserId) {
    return { kind: "user", id: issue.createdByUserId };
  }

  if (issue.createdByAgentId) {
    if (issue.requestedByUserId) {
      return { kind: "user", id: issue.requestedByUserId, viaAgentId: issue.createdByAgentId };
    }
    return { kind: "agent", id: issue.createdByAgentId };
  }

  if (issue.requestedByUserId) {
    return { kind: "user", id: issue.requestedByUserId };
  }

  return null;
}

export interface CreationAttributionFields {
  createdByUserId?: string | null;
  createdByAgentId?: string | null;
  requestedByUserId?: string | null;
  requestEvidence?: CreationRequestEvidence | null;
}

/**
 * Who created a project, task or folder, and who asked for it.
 *
 * - `creator` is null when no record exists (rows created before attribution
 *   was recorded). Show it as unknown; never guess.
 * - `requestedBy` is set only with evidence: a person's message or an explicit
 *   run request that led the creating agent to act.
 * - `requestUnproven` is true when an agent created the record and no
 *   person's request is proven.
 */
export interface CreationAttribution {
  creator: { kind: "user"; id: string } | { kind: "agent"; id: string } | null;
  requestedBy: { userId: string; evidence: CreationRequestEvidence } | null;
  requestUnproven: boolean;
}

export function deriveCreationAttribution(record: CreationAttributionFields): CreationAttribution {
  const creator = record.createdByUserId
    ? { kind: "user" as const, id: record.createdByUserId }
    : record.createdByAgentId
      ? { kind: "agent" as const, id: record.createdByAgentId }
      : null;
  const requestedBy = creator?.kind === "user" || !record.requestedByUserId
    ? null
    : { userId: record.requestedByUserId, evidence: record.requestEvidence ?? "message" };
  return { creator, requestedBy, requestUnproven: creator?.kind === "agent" && !requestedBy };
}
