# Project folders and per-person access (proposal)

Status: decisions taken 2026-10-15; first slice implemented (see "Decisions and first slice").
Date: 2026-10-15

## What exists today

| Concept | Where | Notes |
|---|---|---|
| Private projects | `projects.visibility` (`open` / `private`), `project_access_members` (people **and** agents) | Members get full read/write; there is no per-member role. |
| Read enforcement | `server/src/services/authorization.ts` (`issuePrivacyPrincipalCondition`, `projectReadSqlCondition`, `decide()` for `project:read` / `issue:read`) | Pushed down into project/task lists, search, documents, comments, attachments, activity, approvals, decisions feed. |
| Who manages access | `assertCanManageProjectPrivacy` (`server/src/routes/projects.ts`) | Privacy owner, instance admin, or a company owner/admin — but a non-member owner/admin first gets 404 from the read check, so in practice only members can manage. |
| Company roles | `owner`, `admin`, `operator`, `viewer` (`packages/shared/src/constants.ts`) | `viewer` is read-only everywhere. |
| Folders | `folders` table, `kind` = `routine` \| `skill` | Company-level only; nothing groups tasks inside a project. |
| Project order | per-user sidebar order (`company_user_sidebar_preferences.project_order`) | Already lets each person order projects. |

Gaps fixed separately (commit "apply private project/task read checks to more
surfaces"): company artifacts list, artifact search counts/rows, private
project names in costs by project, task → cases list, recent tasks on member
profiles.

## Proposed model (simple and consistent)

```
Company
└── Project (open | private, access list = people + agents)
    ├── Folder (inherits project access, or "restricted" to a subset)
    │   ├── Folder (max depth 3)
    │   │   └── Task → sub-tasks, documents, attachments, comments, runs
    │   └── Task …
    └── Task (no folder = project root)
```

1. **Folders inside a project** reuse the existing `folders` table with a new
   kind `task` and a new nullable `project_id`. Tasks get a nullable
   `folder_id`. Sub-tasks always live in their parent's folder (no
   independent folder), so the tree never splits a task family.
2. **Access stays project-first.** A folder either *inherits* the project's
   audience (default) or is *restricted* to a subset of it. Restriction can
   only narrow access, never widen it: a person must be able to read the
   project to be added to a folder.
3. **What a person can do** = the stricter of their company role and their
   project/folder role. Project/folder access entries get a role reusing the
   company vocabulary:
   - `viewer`: read only;
   - `operator` (default for existing rows → no change): create and edit tasks;
   - `admin`: also manage the access list and folders.
4. **Enforcement in one place**: the folder condition is added to the same
   SQL predicate and `decide()` path that private projects use, so lists,
   search, direct links, documents, attachments, artifacts, activity,
   decisions, costs-by-project names and exports all follow it. Direct links
   to unreadable items answer 404 (no existence leak).
5. **Agents**: an agent assigned to a task in a restricted folder must be on
   the folder list (or the assignment is rejected with a clear message), the
   same rule private projects already apply.

## Migration and compatibility

- Additive only: new nullable columns, a new folder kind, a new role column
  defaulting to `operator`. Existing projects, members and tasks keep exactly
  the access they have today.
- No data moves; tasks stay at the project root until someone files them.

## Tests to add

- Folder restricted to person A: person B (project member, not folder member)
  gets 404 on direct task link, does not see the task in lists, search,
  artifacts, activity, decisions, or cost names.
- Project `viewer` cannot create/edit tasks even with company `operator` role.
- Adding a non-project member to a folder is rejected.
- Moving a task between folders re-applies access immediately.
- Migration keeps every existing member's access (snapshot before/after).

## Decisions needed

1. Should company **owners/admins always be able to see and manage** private
   projects (today they cannot unless they are members)?
2. Should **folders also hold documents** that are not attached to a task, or
   is "folders group tasks (and everything inside them)" enough?
3. Should a **company-level grouping of projects** (e.g. "Clients", "Internal")
   be added, or is the existing per-person sidebar order enough?

## Decisions and first slice (2026-10-15)

Product answers:

1. **Projects view like Tasks.** The Projects page gets **My projects** and
   **All projects**, like Tasks' "Mine" and "All tasks". Visibility rules do
   not change: owners/admins still only see private projects they are members
   of, and "All projects" means every project the person can read.
2. **Folders hold projects, not tasks.** Tasks are already grouped by projects,
   so folders group projects instead (this replaces the "Folder inside a
   project" model above).
3. Company-level grouping of projects is therefore the folder feature itself.

Implemented:

- `folders.kind = "project"` (shared `FolderKind`) and nullable
  `projects.folder_id` (migration `0349_project_folders`, `ON DELETE SET NULL`).
  Existing projects stay unfiled; no access changes.
- Folder counts and project moves use the actor's project read condition, so a
  private project is neither counted nor movable by people outside its access
  list (unreadable projects answer 404). Test:
  `server/src/__tests__/project-folders.test.ts`.
- Projects page: My/All toggle, folder rail (create, rename, color, delete),
  mobile folder sheet, per-row **Move to…**. Folder controls are translated.

Decided 2026-10-16: **no per-folder access.** Folders only organize; who can
see a project is decided by the project alone (open, or private with its access
list). Making a folder restrict access was considered and rejected: moving a
project between folders must never change who can read it.
