/** Why Paperclip knows that a person asked an agent to create a record. */
export const CREATION_REQUEST_EVIDENCE = ["message", "manual_wake"] as const;
export type CreationRequestEvidence = (typeof CREATION_REQUEST_EVIDENCE)[number];

/** Why a project appears in the viewer's "My projects" list. */
export const PROJECT_INVOLVEMENT_REASONS = ["created", "requested", "shared", "tasks", "following", "personal"] as const;
export type ProjectInvolvementReason = (typeof PROJECT_INVOLVEMENT_REASONS)[number];

export interface MyProjectInvolvement {
  projectId: string;
  reasons: ProjectInvolvementReason[];
}

/** `GET /api/companies/:companyId/projects/mine` */
export interface MyProjectsResult {
  userId: string;
  projects: MyProjectInvolvement[];
}
