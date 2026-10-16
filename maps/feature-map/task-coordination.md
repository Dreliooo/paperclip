---
navigation: {"section":"Tasks and conversations","sectionOrder":20,"order":20}
---

# Delegation, dependencies, and signoff

A larger task can coordinate child work, dependencies, reviewers, and execution controls while preserving a clear owner and a traceable completion decision.

Implementation: [task thread](../../ui/src/pages/IssueDetail.tsx), [execution policy](../../server/src/services/issues.ts).

Agent access: [companion](../agent-access-map/task-coordination.md).

## Sub-features

- `delegation`: inspect parent/child tasks and the original request behind delegated work.
- `dependencies`: show blocking tasks and wake eligible work when prerequisites resolve.
- `signoff`: apply the configured implementation/review completion policy.
- `tree-control`: pause or resume a task tree without bypassing its gates.
- `objective-mode`: give a task an objective; a coordinator agent delegates subtasks and a supervisor keeps it moving until the coordinator closes it or a time, USD or token limit pauses it.

## How to get to it (user POV)

### `task-relationships`

Open the task’s parent/child and dependency links in task detail.

### `review-and-controls`

Inspect the task’s execution policy and available review, pause, resume, or stop controls.

### `objective-mode`

In a task chat, open the composer "+" menu and choose "Objective". Set the objective, optional criteria, coordinator and limits. The objective card above the composer shows progress, usage and pause/resume/stop controls. In an agent chat the same entry creates a new task for the objective.

## Driving it with Playwright and the Paperclip API

Preconditions: follow the [baseline](./README.md#before-driving-a-journey). Prepare a parent, child, and dependent task plus implementer/reviewer agents. Record execution policy and use a disposable tree.

Parent/dependency navigation and inherited tree holds can be checked on unassigned
tasks. Agents are required for the continuation and signoff portion. A tree pause
creates a hold; it does not change task statuses to a paused status.

### `task-relationships`

Automated: [dependency wakeups](../../server/src/__tests__/issue-dependency-wakeups-routes.test.ts) checks server behavior; visual relationship navigation remains a manual check.

Manual: Block one task on another, finish the prerequisite, and observe the dependent task’s eligible continuation. Follow parent/child links back to the source request. Verify no duplicate run or false parent completion occurs.

### `review-and-controls`

Automated: [execution policy](../../server/src/__tests__/issue-execution-policy.test.ts), [tree control](../../server/src/__tests__/issue-tree-control-service.test.ts), and [signoff browser suite](../../tests/e2e/signoff-policy.spec.ts) target these layers. A linked suite is not a claim that its current run is green.

Manual: Complete implementation under a review-required policy and confirm it waits for the required review outcome. Exercise rejection and later approval. Pause the parent while child work is pending, then verify resumption respects budget and ownership gates.

### `objective-mode`

Automated: [objective service](../../server/src/__tests__/issue-objectives.test.ts) covers start, stall nudges, limit pause/resume and completion; [objective helpers](../../packages/shared/src/issue-objectives.test.ts) and the [composer menu](../../ui/src/components/task-chat/TaskChatComposer.test.tsx) cover the rules and entry point.

Manual: Start an objective with a low USD limit on a disposable task, let the coordinator delegate, and confirm the "Objective check" comments, the limit pause, extending the limit, and the achieved state when the coordinator closes the task.

## Gotchas

- Review completion and task completion are different events under some policies.
- Pausing a tree must not be “tested” by changing statuses until the screen looks quiet.
- Use [questions and approvals](./questions-and-approvals.md) for decision forms and [recovery](./recovery.md) for interrupted work.
