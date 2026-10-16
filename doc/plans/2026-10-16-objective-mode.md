# Objective mode ("Objetivo")

Status: approved 2026-10-16, building the first slice.

## What the person asked for

A button in a task chat (or an agent chat) where a person types an
objective. Paperclip keeps working until the objective is done: a coordinator
agent breaks it down, delegates to other agents, watches whether they answer,
follows up, and stays until the end.

Product decisions (2026-10-16):

1. Limits are agreed per objective in three optional dimensions: time,
   billed USD, and tokens. Reaching a limit pauses the work and asks the
   person, who can extend it or stop.
2. Only the coordinator decides when the objective is done. It may ask
   another agent to validate, but validation is never required.
3. Any agent can coordinate. The CEO is preselected; the person can pick
   another agent.

## How it differs from `/goal`

`/goal` hands an objective to one assignee's provider session (Codex or Claude
ACP) and the provider keeps taking turns. It never involves other agents and
only works for some adapters. Objective mode works with every adapter because
it is built from Paperclip primitives: tasks, subtasks, assignment, wakeups,
comments, budgets and subtree holds. Both can coexist on one task.

## Model

`issue_objectives` (one active objective per root task):

| Field | Meaning |
|---|---|
| `issue_id` | Root task. Its subtree is the objective's work. |
| `objective`, `success_criteria` | The person's words; optional checklist. |
| `coordinator_agent_id` | Assignee of the root task while active. |
| `status` | `active`, `paused`, `limit_reached`, `achieved`, `stopped`. |
| `max_spend_cents`, `max_tokens`, `deadline_at` | Optional limits. |
| `last_check_at`, `last_nudge_at`, `nudge_count`, `last_progress_fingerprint` | Supervisor state. |
| `pause_hold_id` | Subtree hold created when a limit is reached. |

Spend and tokens are computed from `cost_events` of the subtree since the
objective started (billed `cost_cents`; tokens = input + cached + output).

## Supervisor loop (harness-owned)

Runs on the periodic heartbeat recovery tick, like task watchdogs:

1. Root task done → `achieved`. Root cancelled → `stopped`.
2. Limit exceeded → create a subtree pause hold, interrupt active runs, post
   a system comment, status `limit_reached`. The person extends a limit
   (hold released, `active`) or stops.
3. Otherwise compute a progress fingerprint over the subtree (statuses,
   comment counts, active runs). If a child changed state since the last
   check (done, blocked, cancelled, review), or work has been idle longer
   than the stall window with no active run, post an "objective check"
   system comment with a digest on the root task and wake the coordinator
   (`issue_commented`). Nudges are throttled (minimum 10 minutes apart) and
   never sent while the coordinator already has an active or queued run.

The coordinator receives a brief comment at start with the objective,
criteria, limits and the rules: delegate with subtasks (`parentId` = root),
follow up on silent assignees, close the root task only when the objective is
met, and summarize evidence per criterion in the closing comment. Validation
by another agent is optional.

## Surfaces

- Task chat: "Objetivo" in the composer "+" menu and an objective card above
  the composer (progress, spend/tokens/time vs limits, last check, pause,
  resume, stop, extend limits).
- Agent chat: "Objetivo" creates a new root task from the chat (agent chats do
  not receive child-completion wakes) and links to it.
- API: `GET/POST/PATCH /api/issues/:id/objective`,
  `POST /api/issues/:id/objective/actions` (pause, resume, stop). Board
  actors create and control; agents can read. Activity is logged for every
  mutation.

## Out of scope for the first slice

- Attention-feed items for limit decisions (the card and system comment
  carry it for now).
- Automatic re-planning heuristics beyond the digest; the coordinator plans.
