import { sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { PROJECT_INVOLVEMENT_REASONS, type MyProjectInvolvement, type ProjectInvolvementReason } from "@paperclipai/shared";

/**
 * Projects related to one person, and why ("My projects").
 *
 * - created:   the person created the project.
 * - requested: an agent created it at the person's request (with evidence).
 * - shared:    the person is an access member of a private project.
 * - tasks:     a task in it is assigned to, created by, or requested by them
 *              (cancelled and hidden tasks excluded).
 * - following: they joined or starred it.
 * - personal:  their own "My private tasks" project.
 *
 * A project the person left is excluded. The caller must still apply project
 * read access to the returned ids; this query never widens visibility.
 */
type InvolvementRow = { project_id: string; reasons: string[] | null };

export async function listProjectInvolvement(
  db: Pick<Db, "execute">,
  companyId: string,
  userId: string,
): Promise<MyProjectInvolvement[]> {
  const p = { companyId, userId };
  const result = await db.execute<InvolvementRow>(sql`
    WITH "reasons" AS (
      SELECT pr."id" AS "project_id", 'created' AS "reason"
      FROM "projects" AS pr
      WHERE pr."company_id" = ${p.companyId}::uuid AND pr."created_by_user_id" = ${p.userId}
      UNION ALL
      SELECT pr."id", 'requested'
      FROM "projects" AS pr
      WHERE pr."company_id" = ${p.companyId}::uuid AND pr."requested_by_user_id" = ${p.userId}
        AND pr."created_by_user_id" IS NULL
      UNION ALL
      SELECT pr."id", 'shared'
      FROM "project_access_members" AS m
      JOIN "projects" AS pr ON pr."id" = m."project_id" AND pr."company_id" = m."company_id"
      WHERE m."company_id" = ${p.companyId}::uuid AND m."subject_type" = 'user' AND m."subject_id" = ${p.userId}
        AND pr."visibility" = 'private'
      UNION ALL
      SELECT i."project_id", 'tasks'
      FROM "issues" AS i
      WHERE i."company_id" = ${p.companyId}::uuid AND i."project_id" IS NOT NULL
        AND i."hidden_at" IS NULL AND i."status" <> 'cancelled'
        AND (i."assignee_user_id" = ${p.userId} OR i."created_by_user_id" = ${p.userId} OR i."requested_by_user_id" = ${p.userId})
      UNION ALL
      SELECT pr."id", 'personal'
      FROM "projects" AS pr
      WHERE pr."company_id" = ${p.companyId}::uuid AND pr."personal_owner_user_id" = ${p.userId}
      UNION ALL
      SELECT ms."project_id", 'following'
      FROM "project_memberships" AS ms
      WHERE ms."company_id" = ${p.companyId}::uuid AND ms."user_id" = ${p.userId} AND ms."state" = 'joined'
    )
    SELECT r."project_id", array_agg(DISTINCT r."reason" ORDER BY r."reason") AS "reasons"
    FROM "reasons" AS r
    JOIN "projects" AS pr ON pr."id" = r."project_id" AND pr."company_id" = ${p.companyId}::uuid
    WHERE NOT EXISTS (
        SELECT 1 FROM "project_memberships" AS left_ms
        WHERE left_ms."company_id" = ${p.companyId}::uuid AND left_ms."user_id" = ${p.userId}
          AND left_ms."project_id" = r."project_id" AND left_ms."state" = 'left'
      )
    GROUP BY r."project_id"
  `);
  const order = new Map(PROJECT_INVOLVEMENT_REASONS.map((reason, index) => [reason, index]));
  return (Array.from(result) as InvolvementRow[]).map((row) => ({
    projectId: row.project_id,
    reasons: (row.reasons ?? [])
      .filter((reason): reason is ProjectInvolvementReason => order.has(reason as ProjectInvolvementReason))
      .sort((a, b) => order.get(a)! - order.get(b)!),
  }));
}
