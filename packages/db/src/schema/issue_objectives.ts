import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { issueTreeHolds } from "./issue_tree_holds.js";
import { issues } from "./issues.js";

/**
 * A person's objective on a root task. The coordinator agent delegates the
 * work as subtasks; a harness-owned supervisor watches the subtree, nudges the
 * coordinator, and pauses the subtree when an agreed limit is reached.
 */
export const issueObjectives = pgTable(
  "issue_objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    objective: text("objective").notNull(),
    successCriteria: jsonb("success_criteria").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    coordinatorAgentId: uuid("coordinator_agent_id").notNull().references(() => agents.id),
    status: text("status").notNull().default("active"),
    maxSpendCents: integer("max_spend_cents"),
    maxTokens: bigint("max_tokens", { mode: "number" }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    limitReason: text("limit_reason"),
    pauseHoldId: uuid("pause_hold_id").references(() => issueTreeHolds.id, { onDelete: "set null" }),
    lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
    lastNudgeAt: timestamp("last_nudge_at", { withTimezone: true }),
    nudgeCount: integer("nudge_count").notNull().default(0),
    lastProgressFingerprint: text("last_progress_fingerprint"),
    lastProgressAt: timestamp("last_progress_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIssueUq: uniqueIndex("issue_objectives_company_issue_uq").on(table.companyId, table.issueId),
    companyStatusIdx: index("issue_objectives_company_status_idx").on(table.companyId, table.status),
    statusCheck: check(
      "issue_objectives_status_check",
      sql`${table.status} in ('active', 'paused', 'limit_reached', 'achieved', 'stopped')`,
    ),
    limitsCheck: check(
      "issue_objectives_limits_check",
      sql`(${table.maxSpendCents} is null or ${table.maxSpendCents} > 0) and (${table.maxTokens} is null or ${table.maxTokens} > 0)`,
    ),
  }),
);
