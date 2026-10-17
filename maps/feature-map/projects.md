---
navigation: {"section":"Projects and execution","sectionOrder":40,"order":10}
---

# Projects and repositories

People group tasks into projects, attach goals and repositories, and configure the context and defaults used by project work.

Implementation: [project list](../../ui/src/pages/Projects.tsx), [project detail](../../ui/src/pages/ProjectDetail.tsx).

Agent access: [companion](../agent-access-map/projects.md).

## Sub-features

- `lifecycle`: create, name, organize, and archive projects.
- `task-context`: inspect project tasks and create work in the selected project.
- `repositories`: configure repository/workspace sources and verify usable checkouts.
- `defaults`: maintain project instructions, environment, goal, and budget context where offered.

## How to get to it (user POV)

### `project-list`

Open `/projects`, create a project, and enter its overview or Issues view.
Switch between **My projects** and **All projects** (`?view=mine|all`; the last
choice is remembered per browser). My projects comes from the server and each row
says why it is yours (created, requested, shared, your tasks, following, personal);
All projects shows who created each one. File projects into folders and subfolders
(up to four levels) from the left rail or a row's **Move to…** menu
(`?folder=<id>|unfiled`); a folder shows its subfolders' projects too. Project
details show **Created by**, **Requested by** (only with evidence), **Access
owner** and **Lead agent**.

### `repository-settings`

Open `/projects/:projectId/configuration` and its repository/workspace settings.

## Driving it with Playwright and the Paperclip CLI

Preconditions: follow the [baseline](./README.md#before-driving-a-journey). Use a disposable project and a small repository you can access; record checkout and credential ownership.

### `project-list`

Automated: [projects UI](../../ui/src/pages/Projects.test.tsx) and [project detail](../../ui/src/pages/ProjectDetail.test.tsx) are component tests.

Automated (folders): [project folder access](../../server/src/__tests__/project-folders.test.ts) proves folder counts and moves follow private-project read access.

Automated (ownership): [project ownership](../../server/src/__tests__/project-ownership.test.ts) checks that two people get different My projects lists, private projects stay hidden, and requesters need run evidence; [project views](../../ui/src/lib/project-views.test.ts) covers the view and subfolder filters. Migration 0351's historical backfill was checked against fictional data in a local Postgres only.

Manual: Create a project, add a task from its view, and reload. Verify the task belongs to that project, list counts are plausible, and links preserve company scope. Archive only the disposable project and inspect list/task behavior.

### `repository-settings`

Automated: [repository persistence](../../server/src/__tests__/project-repositories-persistence.test.ts) and [repository browser suite](../../tests/e2e/project-repositories.spec.ts) cover configured repository workflows.

Manual: Attach a small repository, save, and create a project task. Inspect the actual checkout/revision used by its run. Test an invalid repository and missing credentials without treating a saved URL as a working workspace.

## Gotchas

- `/overview` now selects Configuration, not a distinct overview page. Personal
  join/leave and star controls have their own persistence and should be checked
  when affected; **Star/Unstar {project name}** is the visible star action.
- Project name slugs change on rename and have no historical alias lookup.
  Reopen a renamed project through its stable UUID route, wait for the current
  Configuration form, and record the newly normalized URL before reloading.

- Project folders only organize: they never change who can read a project. A
  private project counts in a folder only for people on its access list.
- Project repository configuration and a provisioned execution workspace are different records.
- See [workspaces](./workspaces.md), [goals](./goals.md), and [budgets](./budgets-costs.md) for those features.
- Do not assume a deleted or archived project should erase its historical task evidence.

### Automatic repository skills

Creating or attaching a GitHub repository enqueues skill import without another setup
step. Check Skills → Sources and the installed library afterward. Ordinary edits to
older projects do not adopt their repositories; explicit adoption belongs in Sources.
Removing a repository retains installed skills and originating project access but stops
its automatic tracking. Changing the ref does not retarget existing skill references.

### Documentation scope: Projects and execution workspaces

Provider-specific provisioning, multi-repository/submodule edge cases, Git reconciliation variants, and all service exposure combinations require deeper recipes.
