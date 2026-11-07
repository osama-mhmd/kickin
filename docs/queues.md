# Queues

KickIn uses **BullMQ on Upstash Redis**. RabbitMQ was rejected because of hosting cost.

## Why two queues

| Queue              | Job                                        | Why separate                                                                          |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `repo-computation` | Download tarball, extract tree + hierarchy | CPU/memory heavy, long-running. Must not starve AI jobs.                              |
| `ai-analysis`      | One AI call (and follow-up pass) per issue | External model providers: slow, rate-limited, timeouts are expected, not exceptional. |

Each queue gets its own worker with its own concurrency and rate limit.

## Conventions

- **Deterministic job IDs** make enqueueing idempotent:
  - `repo:{owner}/{name}@{commitSha}`
  - `analysis:{issueId}:{userId|maintainer}:{pass}`
- **Jobs carry IDs, not payloads.** Store big data (issue bodies, hierarchy) in Postgres; the job holds references.
- **Idempotent processors.** A retry must not duplicate rows. Upsert by the deterministic key.
- **Status lives in the DB** (`pending | processing | done | failed`), so the UI never needs to talk to Redis.

## repo-computation

- Concurrency: low (1–2). Heavy work.
- Retries: 3, exponential backoff.
- Timeout guard: abort downloads or extractions that exceed a hard cap, and mark the job `failed` with a reason.
- Reject oversized repos early (check size before downloading) and report a clear error.

## ai-analysis

- Use BullMQ's **rate limiter** (`limiter: { max, duration }`) tuned to the _lowest_ free provider limit in the fallback chain, not the highest.
- Retries: more generous (5+) with exponential backoff and jitter. 429s and timeouts are normal.
- On provider failure, the job moves to the **next model in the fallback chain** (`docs/free-models.md`) before consuming a retry attempt.
- If the response is not valid JSON, retry once with a repair instruction; after that, mark the analysis `failed` (never guess).
- A `needs_files` response schedules a **second pass** job. Cap passes at 2 to bound cost and latency.

## Upstash + BullMQ notes

- BullMQ polls Redis, and Upstash meters commands. Keep the number of workers and queues small, and raise polling/stalled-check intervals where BullMQ allows it. Check Upstash's current free-tier command limits.
- Run workers as a separate long-running process (`pnpm worker`), not inside SvelteKit endpoints (`+server.ts`), load functions, or serverless functions.
- Use one shared ioredis-compatible connection config in `src/lib/server/queues/connection.ts`.
