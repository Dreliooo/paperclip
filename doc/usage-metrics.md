# Usage metrics: tokens, reported spend and API-equivalent cost

Costs → **Usage** and the Dashboard usage tile show three different
quantities. They are never added together.

| Quantity | Meaning | Source |
|---|---|---|
| Tokens | Uncached input, cache writes, cache reads and output. Total = input + cache reads + output (cache writes are part of input). | `cost_events` token columns; `cache_write_input_tokens` is null when the integration did not report writes. |
| Spend reported by provider | Money actually charged, as the provider reported it. Subscription-included usage is 0. Paperclip rate-card estimates for metered API usage are shown separately. | `cost_events.cost_cents` where `cost_status = 'reported'`. |
| API-equivalent cost | What the tokens would cost at published pay-as-you-go list prices. Not a charge and not subscription consumption. Models without a rate card are "No price available" (incomplete), never $0. | `packages/shared/src/api-equivalent-pricing.ts` (source URL and verification date per model). |

## Grouping

`GET /api/companies/:companyId/costs/usage-breakdown?groupBy=model|agent|user&provider=&from=&to=`

- **Person**: the responsible user recorded on the run (who woke or requested
  the work, or the task's responsible person). Runs where Paperclip fell back
  to the company's default responsible user (`executionIdentityCause =
  company_default`) and scheduled runs without a person are **Automatic**; the
  rest without a member are **Unattributed**. Historical rows are not
  re-attributed. Each cost event belongs to exactly one group.
- **Agent**: decisions and fast responses are Paperclip's own calls.

## Display preference

Profile → Display preferences (or the toggle on Costs → Usage) stores
`tokens`, `costs` or `both` per user (`user_preferences.usage_display`).

## Prompt-cache reuse

`GET /api/companies/:companyId/agents/:agentId/cache-reuse` and
`GET /api/issues/:id/cache-reuse` assess the latest 20 runs: reuse =
cache reads / (reads + writes + uncached input). "Reuse dropped" is only
reported against the agent's or conversation's own baseline, with causes that
are visible in run records (new session, model change, gap longer than the
default 5-minute cache life). Integrations without cache counters show
"Not enough data". Paperclip does not send keep-alive calls.

## Updating rate cards

Edit `API_RATE_CARDS`, keep `source` and `verifiedAt` accurate, and update
`api-equivalent-pricing.test.ts`. Do not infer subscription limits from tokens.
