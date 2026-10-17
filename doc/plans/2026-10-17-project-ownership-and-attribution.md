# Project ownership views and creation attribution

Status: building, 2026-10-17. Access rules do not change in this work.

## Problems found

1. **"My projects" and "All projects" showed the same list.** The "My
   projects" view (`ui/src/lib/project-views.ts`, added with project folders)
   listed every visible project except the ones the viewer had explicitly left.
   Leaving a project is rare, so for almost everyone the two views matched. The
   code worked as written; the definition was wrong.
2. **Creation attribution was missing or misleading.**
   - Projects and folders had no creator columns. The only record was the
     activity log (`project.created`, `folder.created`).
   - Tasks record the creating person or agent. For agent-created tasks, the
     "Originating" row showed `issues.responsible_user_id` as if that person had
     asked for the task. That column is the person runs act on behalf of. It
     falls back to the company default user, so agent work could be attributed
     to one person without evidence.
   - `projects.privacy_owner_user_id` is set at creation, for agents to the
     on-behalf person, which can be the company default. It manages private
     access and is not proof of who created or asked for a project.
3. **Nested folders worked on the server and the mobile sheet only.** The
   service supports subfolders (depth 4), but the desktop rail was flat and the
   create/edit dialog could not choose a parent folder.

## Definitions shown to people

| Field | Projects | Tasks | Folders |
|---|---|---|---|
| Created by | Person or agent that made the record | same | same |
| Requested by | Person whose message or explicit run request led an agent to create it, only with evidence | same | same |
| Owner / assignee | Access owner (manages private access) | Assignee: person or executing agent | — |
| Lead agent | `lead_agent_id`, when set | — | — |

When no record exists, the UI says "Unknown (created before this was
recorded)". When an agent created something and no person's request can be
proven, the UI says "No evidence of who asked".

## Evidence of a request

Agent runs carry an identity chain (`run_identity_contexts`). A context whose
`cause` is `instruction`, `steering` or `queued_comment_interrupt` (a person's
message) or `manual_user_wake` (a person started the run) is evidence that
the context's `responsible_user_id` asked. The resolver walks from the
creating context to its ancestors, across delegated runs, and stops at the
first `company_default` context. Older runs without identity contexts fall
back to the authors of the comments that woke the run. Nothing else counts:
not `issues.responsible_user_id`, not the company default, not the project
access owner.

## Data model (migration 0351)

- `projects` and `folders`: `created_by_user_id`, `created_by_agent_id`
  (agents, set null), `origin_run_id`, `origin_identity_context_id`,
  `requested_by_user_id`, `request_evidence` (`message` | `manual_wake`).
- `issues`: `requested_by_user_id`, `request_evidence`. Creator and origin
  columns already exist.

New records are written at creation from the authenticated actor. Clients
cannot set any of these fields.

### Historical data

- Project and folder creators are copied from the first `project.created` /
  `folder.created` activity row: a user actor sets `created_by_user_id`, an
  agent actor sets `created_by_agent_id` (only if the agent still exists),
  and the row's run is kept as `origin_run_id`.
- Requesters are filled for agent-created rows only, with the same evidence
  rule, limited to identity contexts and comments that existed before the
  record was created.
- Rows without evidence stay empty and show as unknown. No access or
  visibility column is changed.

## "My projects"

`GET /api/companies/:companyId/projects/mine` (board users) returns the
projects related to the viewer and why:

- `created`: you created it.
- `requested`: an agent created it at your request (evidence above).
- `shared`: you are an access member of a private project.
- `tasks`: it has tasks assigned to you, created by you, or requested by you
  (cancelled and hidden tasks excluded).
- `following`: you joined or starred it.
- `personal`: your own "My private tasks" project.

A project you left is excluded. The server applies the normal project read
check to the result. Only ids and reasons are returned, and every project
still comes from the regular list. "All projects" stays "every project you can
see". The page explains both views and shows the reasons on each row.

## Caches

The "mine" query key includes the company and the signed-in user. Account
changes reset account-scoped caches, including when the user changes without
going through sign-out.

## Folders

- Desktop rail shows the tree with indentation. Create/edit can choose a parent
  folder. Selecting a folder shows its projects and those in its subfolders.
  Counts include subfolders.
- Folders never grant or restrict access. A folder shows only projects you can
  already see. Moving a project or folder never changes who can see it.
- Folder rows show who created them.
