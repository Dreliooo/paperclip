CREATE TABLE "issue_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"objective" text NOT NULL,
	"success_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"coordinator_agent_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"max_spend_cents" integer,
	"max_tokens" bigint,
	"deadline_at" timestamp with time zone,
	"limit_reason" text,
	"pause_hold_id" uuid,
	"last_check_at" timestamp with time zone,
	"last_nudge_at" timestamp with time zone,
	"nudge_count" integer DEFAULT 0 NOT NULL,
	"last_progress_fingerprint" text,
	"last_progress_at" timestamp with time zone,
	"created_by_user_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_objectives_status_check" CHECK ("issue_objectives"."status" in ('active', 'paused', 'limit_reached', 'achieved', 'stopped')),
	CONSTRAINT "issue_objectives_limits_check" CHECK (("issue_objectives"."max_spend_cents" is null or "issue_objectives"."max_spend_cents" > 0) and ("issue_objectives"."max_tokens" is null or "issue_objectives"."max_tokens" > 0))
);
--> statement-breakpoint
ALTER TABLE "issue_objectives" ADD CONSTRAINT "issue_objectives_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_objectives" ADD CONSTRAINT "issue_objectives_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_objectives" ADD CONSTRAINT "issue_objectives_coordinator_agent_id_agents_id_fk" FOREIGN KEY ("coordinator_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_objectives" ADD CONSTRAINT "issue_objectives_pause_hold_id_issue_tree_holds_id_fk" FOREIGN KEY ("pause_hold_id") REFERENCES "public"."issue_tree_holds"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "issue_objectives_company_issue_uq" ON "issue_objectives" USING btree ("company_id","issue_id");
--> statement-breakpoint
CREATE INDEX "issue_objectives_company_status_idx" ON "issue_objectives" USING btree ("company_id","status");
