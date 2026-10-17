-- Creation attribution for projects, folders and tasks.
-- Adds who created a record and, only with evidence, which person asked an agent
-- to create it. Historical rows are filled from recorded facts only; rows without
-- evidence stay NULL and are shown as unknown. No access or visibility changes.
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "requested_by_user_id" text;
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "request_evidence" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "created_by_user_id" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "created_by_agent_id" uuid;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "origin_run_id" uuid;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "origin_identity_context_id" uuid;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "requested_by_user_id" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "request_evidence" text;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM "pg_constraint" WHERE "conname" = 'projects_created_by_agent_id_agents_id_fk'
	) THEN
		ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM "pg_constraint" WHERE "conname" = 'projects_request_evidence_check'
	) THEN
		ALTER TABLE "projects" ADD CONSTRAINT "projects_request_evidence_check" CHECK ("projects"."request_evidence" is null or "projects"."request_evidence" in ('message', 'manual_wake'));
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "created_by_user_id" text;
--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "created_by_agent_id" uuid;
--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "origin_run_id" uuid;
--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "origin_identity_context_id" uuid;
--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "requested_by_user_id" text;
--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "request_evidence" text;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM "pg_constraint" WHERE "conname" = 'folders_created_by_agent_id_agents_id_fk'
	) THEN
		ALTER TABLE "folders" ADD CONSTRAINT "folders_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM "pg_constraint" WHERE "conname" = 'folders_request_evidence_check'
	) THEN
		ALTER TABLE "folders" ADD CONSTRAINT "folders_request_evidence_check" CHECK ("folders"."request_evidence" is null or "folders"."request_evidence" in ('message', 'manual_wake'));
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_company_created_by_user_idx" ON "projects" USING btree ("company_id","created_by_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_company_requested_by_user_idx" ON "projects" USING btree ("company_id","requested_by_user_id");
--> statement-breakpoint
-- Creators of existing projects: copied from the first "project.created" activity row.
-- A user actor is the creator; an agent actor counts only if the agent still exists.
WITH "created" AS (
	SELECT DISTINCT ON (a."entity_id") a."company_id", a."entity_id", a."actor_type", a."actor_id", a."agent_id", a."run_id"
	FROM "activity_log" AS a
	WHERE a."action" = 'project.created' AND a."entity_type" = 'project'
	ORDER BY a."entity_id", a."created_at", a."id"
)
UPDATE "projects" AS t
SET "created_by_user_id" = CASE WHEN c."actor_type" = 'user' THEN c."actor_id" END,
	"created_by_agent_id" = CASE
		WHEN c."actor_type" = 'agent' AND EXISTS (SELECT 1 FROM "agents" AS ag WHERE ag."id" = c."agent_id") THEN c."agent_id"
	END,
	"origin_run_id" = c."run_id"
FROM "created" AS c
WHERE c."entity_id" = t."id"::text
	AND c."company_id" = t."company_id"
	AND t."created_by_user_id" IS NULL
	AND t."created_by_agent_id" IS NULL;
--> statement-breakpoint
-- Creators of existing folders: copied from the first "folder.created" activity row.
-- A user actor is the creator; an agent actor counts only if the agent still exists.
WITH "created" AS (
	SELECT DISTINCT ON (a."entity_id") a."company_id", a."entity_id", a."actor_type", a."actor_id", a."agent_id", a."run_id"
	FROM "activity_log" AS a
	WHERE a."action" = 'folder.created' AND a."entity_type" = 'folder'
	ORDER BY a."entity_id", a."created_at", a."id"
)
UPDATE "folders" AS t
SET "created_by_user_id" = CASE WHEN c."actor_type" = 'user' THEN c."actor_id" END,
	"created_by_agent_id" = CASE
		WHEN c."actor_type" = 'agent' AND EXISTS (SELECT 1 FROM "agents" AS ag WHERE ag."id" = c."agent_id") THEN c."agent_id"
	END,
	"origin_run_id" = c."run_id"
FROM "created" AS c
WHERE c."entity_id" = t."id"::text
	AND c."company_id" = t."company_id"
	AND t."created_by_user_id" IS NULL
	AND t."created_by_agent_id" IS NULL;
--> statement-breakpoint
-- Requesters of existing agent-created projects: only with evidence (see doc/plans/2026-10-17-project-ownership-and-attribution.md).
WITH RECURSIVE "targets" AS (
	SELECT t."id", t."company_id", t."created_at", t."origin_run_id" AS "run_id",
		COALESCE(t."origin_identity_context_id", (
			SELECT c."id" FROM "run_identity_contexts" AS c
			WHERE c."company_id" = t."company_id" AND c."run_id" = t."origin_run_id" AND c."created_at" <= t."created_at"
			ORDER BY c."revision" DESC LIMIT 1
		)) AS "start_context_id"
	FROM "projects" AS t
	WHERE t."created_by_agent_id" IS NOT NULL
		AND t."created_by_user_id" IS NULL
		AND t."requested_by_user_id" IS NULL
), "chain" AS (
	SELECT tg."id" AS "target_id", c."company_id", c."id", c."parent_context_id", c."cause", c."responsible_user_id", 0 AS "depth"
	FROM "targets" AS tg
	JOIN "run_identity_contexts" AS c ON c."id" = tg."start_context_id" AND c."company_id" = tg."company_id"
	UNION ALL
	SELECT ch."target_id", c."company_id", c."id", c."parent_context_id", c."cause", c."responsible_user_id", ch."depth" + 1
	FROM "chain" AS ch
	JOIN "run_identity_contexts" AS c ON c."id" = ch."parent_context_id" AND c."company_id" = ch."company_id"
	WHERE ch."depth" < 50 AND ch."cause" <> 'company_default'
), "context_evidence" AS (
	SELECT DISTINCT ON (ch."target_id") ch."target_id", ch."responsible_user_id" AS "user_id",
		CASE WHEN ch."cause" = 'manual_user_wake' THEN 'manual_wake' ELSE 'message' END AS "evidence"
	FROM "chain" AS ch
	WHERE ch."responsible_user_id" IS NOT NULL
		AND ch."cause" IN ('instruction', 'steering', 'queued_comment_interrupt', 'manual_user_wake')
	ORDER BY ch."target_id", ch."depth"
), "comment_evidence" AS (
	SELECT DISTINCT ON (tg."id") tg."id" AS "target_id", ic."author_user_id" AS "user_id", 'message' AS "evidence"
	FROM "targets" AS tg
	JOIN "heartbeat_runs" AS r ON r."id" = tg."run_id" AND r."company_id" = tg."company_id"
	CROSS JOIN LATERAL (
		SELECT w."value" AS "comment_id"
		FROM jsonb_array_elements_text(
			CASE WHEN jsonb_typeof(r."context_snapshot" -> 'wakeCommentIds') = 'array' THEN r."context_snapshot" -> 'wakeCommentIds' ELSE '[]'::jsonb END
		) AS w
		UNION
		SELECT r."context_snapshot" ->> 'wakeCommentId'
	) AS wc
	JOIN "issue_comments" AS ic ON ic."id" = CASE WHEN wc."comment_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN wc."comment_id"::uuid END
		AND ic."company_id" = tg."company_id"
	WHERE tg."start_context_id" IS NULL
		AND ic."author_user_id" IS NOT NULL
		AND ic."created_at" <= tg."created_at"
	ORDER BY tg."id", ic."created_at" DESC
), "evidence" AS (
	SELECT * FROM "context_evidence"
	UNION ALL
	SELECT * FROM "comment_evidence"
)
UPDATE "projects" AS t
SET "requested_by_user_id" = e."user_id", "request_evidence" = e."evidence"
FROM "evidence" AS e
WHERE t."id" = e."target_id"
	AND t."requested_by_user_id" IS NULL;
--> statement-breakpoint
-- Requesters of existing agent-created folders: only with evidence (see doc/plans/2026-10-17-project-ownership-and-attribution.md).
WITH RECURSIVE "targets" AS (
	SELECT t."id", t."company_id", t."created_at", t."origin_run_id" AS "run_id",
		COALESCE(t."origin_identity_context_id", (
			SELECT c."id" FROM "run_identity_contexts" AS c
			WHERE c."company_id" = t."company_id" AND c."run_id" = t."origin_run_id" AND c."created_at" <= t."created_at"
			ORDER BY c."revision" DESC LIMIT 1
		)) AS "start_context_id"
	FROM "folders" AS t
	WHERE t."created_by_agent_id" IS NOT NULL
		AND t."created_by_user_id" IS NULL
		AND t."requested_by_user_id" IS NULL
), "chain" AS (
	SELECT tg."id" AS "target_id", c."company_id", c."id", c."parent_context_id", c."cause", c."responsible_user_id", 0 AS "depth"
	FROM "targets" AS tg
	JOIN "run_identity_contexts" AS c ON c."id" = tg."start_context_id" AND c."company_id" = tg."company_id"
	UNION ALL
	SELECT ch."target_id", c."company_id", c."id", c."parent_context_id", c."cause", c."responsible_user_id", ch."depth" + 1
	FROM "chain" AS ch
	JOIN "run_identity_contexts" AS c ON c."id" = ch."parent_context_id" AND c."company_id" = ch."company_id"
	WHERE ch."depth" < 50 AND ch."cause" <> 'company_default'
), "context_evidence" AS (
	SELECT DISTINCT ON (ch."target_id") ch."target_id", ch."responsible_user_id" AS "user_id",
		CASE WHEN ch."cause" = 'manual_user_wake' THEN 'manual_wake' ELSE 'message' END AS "evidence"
	FROM "chain" AS ch
	WHERE ch."responsible_user_id" IS NOT NULL
		AND ch."cause" IN ('instruction', 'steering', 'queued_comment_interrupt', 'manual_user_wake')
	ORDER BY ch."target_id", ch."depth"
), "comment_evidence" AS (
	SELECT DISTINCT ON (tg."id") tg."id" AS "target_id", ic."author_user_id" AS "user_id", 'message' AS "evidence"
	FROM "targets" AS tg
	JOIN "heartbeat_runs" AS r ON r."id" = tg."run_id" AND r."company_id" = tg."company_id"
	CROSS JOIN LATERAL (
		SELECT w."value" AS "comment_id"
		FROM jsonb_array_elements_text(
			CASE WHEN jsonb_typeof(r."context_snapshot" -> 'wakeCommentIds') = 'array' THEN r."context_snapshot" -> 'wakeCommentIds' ELSE '[]'::jsonb END
		) AS w
		UNION
		SELECT r."context_snapshot" ->> 'wakeCommentId'
	) AS wc
	JOIN "issue_comments" AS ic ON ic."id" = CASE WHEN wc."comment_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN wc."comment_id"::uuid END
		AND ic."company_id" = tg."company_id"
	WHERE tg."start_context_id" IS NULL
		AND ic."author_user_id" IS NOT NULL
		AND ic."created_at" <= tg."created_at"
	ORDER BY tg."id", ic."created_at" DESC
), "evidence" AS (
	SELECT * FROM "context_evidence"
	UNION ALL
	SELECT * FROM "comment_evidence"
)
UPDATE "folders" AS t
SET "requested_by_user_id" = e."user_id", "request_evidence" = e."evidence"
FROM "evidence" AS e
WHERE t."id" = e."target_id"
	AND t."requested_by_user_id" IS NULL;
--> statement-breakpoint
-- Requesters of existing agent-created issues: only with evidence (see doc/plans/2026-10-17-project-ownership-and-attribution.md).
WITH RECURSIVE "targets" AS (
	SELECT t."id", t."company_id", t."created_at", CASE WHEN t."origin_run_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN t."origin_run_id"::uuid END AS "run_id",
		COALESCE(t."origin_identity_context_id", (
			SELECT c."id" FROM "run_identity_contexts" AS c
			WHERE c."company_id" = t."company_id" AND c."run_id" = CASE WHEN t."origin_run_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN t."origin_run_id"::uuid END AND c."created_at" <= t."created_at"
			ORDER BY c."revision" DESC LIMIT 1
		)) AS "start_context_id"
	FROM "issues" AS t
	WHERE t."created_by_agent_id" IS NOT NULL
		AND t."created_by_user_id" IS NULL
		AND t."requested_by_user_id" IS NULL
), "chain" AS (
	SELECT tg."id" AS "target_id", c."company_id", c."id", c."parent_context_id", c."cause", c."responsible_user_id", 0 AS "depth"
	FROM "targets" AS tg
	JOIN "run_identity_contexts" AS c ON c."id" = tg."start_context_id" AND c."company_id" = tg."company_id"
	UNION ALL
	SELECT ch."target_id", c."company_id", c."id", c."parent_context_id", c."cause", c."responsible_user_id", ch."depth" + 1
	FROM "chain" AS ch
	JOIN "run_identity_contexts" AS c ON c."id" = ch."parent_context_id" AND c."company_id" = ch."company_id"
	WHERE ch."depth" < 50 AND ch."cause" <> 'company_default'
), "context_evidence" AS (
	SELECT DISTINCT ON (ch."target_id") ch."target_id", ch."responsible_user_id" AS "user_id",
		CASE WHEN ch."cause" = 'manual_user_wake' THEN 'manual_wake' ELSE 'message' END AS "evidence"
	FROM "chain" AS ch
	WHERE ch."responsible_user_id" IS NOT NULL
		AND ch."cause" IN ('instruction', 'steering', 'queued_comment_interrupt', 'manual_user_wake')
	ORDER BY ch."target_id", ch."depth"
), "comment_evidence" AS (
	SELECT DISTINCT ON (tg."id") tg."id" AS "target_id", ic."author_user_id" AS "user_id", 'message' AS "evidence"
	FROM "targets" AS tg
	JOIN "heartbeat_runs" AS r ON r."id" = tg."run_id" AND r."company_id" = tg."company_id"
	CROSS JOIN LATERAL (
		SELECT w."value" AS "comment_id"
		FROM jsonb_array_elements_text(
			CASE WHEN jsonb_typeof(r."context_snapshot" -> 'wakeCommentIds') = 'array' THEN r."context_snapshot" -> 'wakeCommentIds' ELSE '[]'::jsonb END
		) AS w
		UNION
		SELECT r."context_snapshot" ->> 'wakeCommentId'
	) AS wc
	JOIN "issue_comments" AS ic ON ic."id" = CASE WHEN wc."comment_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN wc."comment_id"::uuid END
		AND ic."company_id" = tg."company_id"
	WHERE tg."start_context_id" IS NULL
		AND ic."author_user_id" IS NOT NULL
		AND ic."created_at" <= tg."created_at"
	ORDER BY tg."id", ic."created_at" DESC
), "evidence" AS (
	SELECT * FROM "context_evidence"
	UNION ALL
	SELECT * FROM "comment_evidence"
)
UPDATE "issues" AS t
SET "requested_by_user_id" = e."user_id", "request_evidence" = e."evidence"
FROM "evidence" AS e
WHERE t."id" = e."target_id"
	AND t."requested_by_user_id" IS NULL;
