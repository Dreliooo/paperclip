import { sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import type { CreationRequestEvidence } from "@paperclipai/shared";

/**
 * Who asked an agent to create a project, task or folder.
 *
 * Evidence comes only from the creating run's identity chain: a context caused
 * by a person's message (`instruction`, `steering`, `queued_comment_interrupt`)
 * or by a person starting the run (`manual_user_wake`). The walk follows
 * delegated runs through `parent_context_id` and stops at the first
 * `company_default` context. Runs recorded before identity contexts fall back
 * to the authors of the comments that woke the run. Nothing else counts:
 * `responsible_user_id` and the company default are never treated as a request.
 *
 * Migration 0351 backfills historical rows with the same rule; see
 * doc/plans/2026-10-17-project-ownership-and-attribution.md.
 */
export const HUMAN_REQUEST_CAUSES = ["instruction", "steering", "queued_comment_interrupt", "manual_user_wake"] as const;

export interface CreationRequester {
  requestedByUserId: string;
  requestEvidence: CreationRequestEvidence;
}

export interface CreationRequesterInput {
  companyId: string;
  /** The creating actor's active identity context, when known. */
  identityContextId?: string | null;
  /** The creating run; used when no identity context was passed. */
  runId?: string | null;
  /** Only evidence recorded at or before this moment counts. Defaults to now. */
  at?: Date;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(value: string | null | undefined) {
  return value && UUID_PATTERN.test(value) ? value : null;
}

type Executor = Pick<Db, "execute">;

export async function resolveCreationRequester(
  executor: Executor,
  input: CreationRequesterInput,
): Promise<CreationRequester | null> {
  const p = {
    companyId: input.companyId,
    contextId: uuidOrNull(input.identityContextId),
    runId: uuidOrNull(input.runId),
    at: (input.at ?? new Date()).toISOString(),
  };
  if (!p.contextId && !p.runId) return null;

  const [fromContext] = await executor.execute<{ user_id: string; evidence: CreationRequestEvidence }>(sql`
    WITH RECURSIVE "start" AS (
      SELECT COALESCE(${p.contextId}::uuid, (
        SELECT c."id" FROM "run_identity_contexts" AS c
        WHERE c."company_id" = ${p.companyId}::uuid AND c."run_id" = ${p.runId}::uuid
          AND c."created_at" <= ${p.at}::timestamptz
        ORDER BY c."revision" DESC LIMIT 1
      )) AS "id"
    ), "chain" AS (
      SELECT c."id", c."parent_context_id", c."cause", c."responsible_user_id", 0 AS "depth"
      FROM "start" AS s
      JOIN "run_identity_contexts" AS c ON c."id" = s."id" AND c."company_id" = ${p.companyId}::uuid
      UNION ALL
      SELECT c."id", c."parent_context_id", c."cause", c."responsible_user_id", ch."depth" + 1
      FROM "chain" AS ch
      JOIN "run_identity_contexts" AS c ON c."id" = ch."parent_context_id" AND c."company_id" = ${p.companyId}::uuid
      WHERE ch."depth" < 50 AND ch."cause" <> 'company_default'
    )
    SELECT ch."responsible_user_id" AS "user_id",
      CASE WHEN ch."cause" = 'manual_user_wake' THEN 'manual_wake' ELSE 'message' END AS "evidence"
    FROM "chain" AS ch
    WHERE ch."responsible_user_id" IS NOT NULL
      AND ch."cause" IN ('instruction', 'steering', 'queued_comment_interrupt', 'manual_user_wake')
    ORDER BY ch."depth"
    LIMIT 1
  `);
  if (fromContext) return { requestedByUserId: fromContext.user_id, requestEvidence: fromContext.evidence };
  if (!p.runId) return null;

  const [fromComment] = await executor.execute<{ user_id: string }>(sql`
    SELECT ic."author_user_id" AS "user_id"
    FROM "heartbeat_runs" AS r
    CROSS JOIN LATERAL (
      SELECT w."value" AS "comment_id"
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(r."context_snapshot" -> 'wakeCommentIds') = 'array'
          THEN r."context_snapshot" -> 'wakeCommentIds' ELSE '[]'::jsonb END
      ) AS w
      UNION
      SELECT r."context_snapshot" ->> 'wakeCommentId'
    ) AS wc
    JOIN "issue_comments" AS ic
      ON ic."id" = CASE WHEN wc."comment_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN wc."comment_id"::uuid END
      AND ic."company_id" = r."company_id"
    WHERE r."id" = ${p.runId}::uuid AND r."company_id" = ${p.companyId}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM "run_identity_contexts" AS c
        WHERE c."company_id" = r."company_id" AND c."run_id" = r."id" AND c."created_at" <= ${p.at}::timestamptz
      )
      AND ic."author_user_id" IS NOT NULL
      AND ic."created_at" <= ${p.at}::timestamptz
    ORDER BY ic."created_at" DESC
    LIMIT 1
  `);
  return fromComment ? { requestedByUserId: fromComment.user_id, requestEvidence: "message" } : null;
}

/**
 * Attribution columns for a record an actor is creating now. A person creator
 * needs no requester; an agent creator gets one only with evidence.
 */
export async function creationAttributionForActor(
  executor: Executor,
  companyId: string,
  actor: Express.Request["actor"],
) {
  if (actor.type === "board") {
    return {
      createdByUserId: actor.userId ?? null,
      createdByAgentId: null,
      originRunId: null,
      originIdentityContextId: null,
      requestedByUserId: null,
      requestEvidence: null,
    };
  }
  if (actor.type === "agent" && actor.agentId) {
    const runId = uuidOrNull(actor.runId);
    const identityContextId = uuidOrNull(actor.identityContextId);
    const requester = await resolveCreationRequester(executor, { companyId, identityContextId, runId });
    return {
      createdByUserId: null,
      createdByAgentId: actor.agentId,
      originRunId: runId,
      originIdentityContextId: identityContextId,
      requestedByUserId: requester?.requestedByUserId ?? null,
      requestEvidence: requester?.requestEvidence ?? null,
    };
  }
  return {
    createdByUserId: null,
    createdByAgentId: null,
    originRunId: null,
    originIdentityContextId: null,
    requestedByUserId: null,
    requestEvidence: null,
  };
}
