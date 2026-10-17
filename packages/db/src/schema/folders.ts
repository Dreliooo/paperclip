import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import type { FolderKind } from "@paperclipai/shared";

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    kind: text("kind").$type<FolderKind>().notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => folders.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    systemKey: text("system_key"),
    color: text("color"),
    position: integer("position").notNull().default(0),
    /** Creation attribution. Never client-supplied; see doc/plans/2026-10-17-project-ownership-and-attribution.md. */
    createdByUserId: text("created_by_user_id"),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    originRunId: uuid("origin_run_id"),
    originIdentityContextId: uuid("origin_identity_context_id"),
    requestedByUserId: text("requested_by_user_id"),
    requestEvidence: text("request_evidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requestEvidenceCheck: check(
      "folders_request_evidence_check",
      sql`${table.requestEvidence} is null or ${table.requestEvidence} in ('message', 'manual_wake')`,
    ),
    companyKindPositionIdx: index("folders_company_kind_position_idx").on(
      table.companyId,
      table.kind,
      table.position,
      table.name,
    ),
    companyKindRootSlugUniqueIdx: uniqueIndex("folders_company_kind_root_slug_uq")
      .on(table.companyId, table.kind, table.slug)
      .where(sql`${table.parentId} is null`),
    companyKindParentSlugUniqueIdx: uniqueIndex("folders_company_kind_parent_slug_uq")
      .on(table.companyId, table.kind, table.parentId, table.slug)
      .where(sql`${table.parentId} is not null`),
    companyKindSystemKeyUniqueIdx: uniqueIndex("folders_company_kind_system_key_uq")
      .on(table.companyId, table.kind, table.systemKey)
      .where(sql`${table.systemKey} is not null`),
    companyKindParentPositionIdx: index("folders_company_kind_parent_position_idx").on(
      table.companyId,
      table.kind,
      table.parentId,
      table.position,
      table.name,
    ),
  }),
);
