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
- Use one shared ioredis-compatible connection config in `src/lib/server/common/queues/connection.ts`.

## Queue module (application code)

The queue module is a common module under `src/lib/server/common/queues`:

```
queues/
  index.ts          # public API + shared/default module instance
  connection.ts     # Redis connection config
  errors.ts         # typed errors
  definitions/      # queue names, policy, deterministic ids, validation
  manager/          # BullMQ wrapper (enqueue, getJob, remove, watchJob)
  sse/              # job events -> text/event-stream
```

Do **not** import `bullmq` in services, routes, or workers. Go through the queue module:

```ts
import { getQueueModule } from '$lib/server/common/queues';

const queues = getQueueModule();

const job = await queues.enqueue('ai-analysis', {
	issueId: 123,
	userId: user.id,
	mode: 'contributor',
	pass: 1
});

// Repeating the same enqueue is safe: the job id is derived from the payload.
// The returned snapshot has the deterministic id and the current state.
console.log(job.id, job.state);
```

Use `createQueueModule({ connection, queueFactory })` in tests or a worker that needs an isolated module. Call `closeQueueModule()` on shutdown; `close()` on a module is idempotent.

What the module owns:

- `connection.ts`: the one Redis config (`UPSTASH_REDIS_URL`, `redis://` or `rediss://`).
- `errors.ts`: typed queue errors.
- `definitions/`: queue names, default retry/removal policy, deterministic id builders, payload validation.
- `manager/`: the wrapper (`enqueue`, `getJob`, `remove`, `watchJob`, `close`).
- `sse/`: turns job events into a `text/event-stream` body.

Jobs carry references, not blobs. Keep big data in Postgres. The module validates the payload shape before a job is written, so a malformed job never reaches a worker.

### Progress over SSE

Two thin endpoints expose job progress without letting the UI talk to Redis:

| Endpoint                                    | Purpose                             |
| ------------------------------------------- | ----------------------------------- |
| `GET /api/queues/:queue/jobs/:jobId`        | One JSON snapshot                   |
| `GET /api/queues/:queue/jobs/:jobId/events` | SSE stream of progress/state events |

The SSE route is a thin adapter over `QueueModule.watchJob`. It polls the job, emits only changes (`snapshot`, `state`, `progress`), and closes after `completed`, `failed`, `removed`, `timeout`, or `stream-error`. A missing job keeps the connection open briefly because it may be enqueued milliseconds later.

Client usage (`$lib/queues` is browser-safe):

```svelte
<script lang="ts">
	import { watchJobEvents, type JobEvent } from '$lib/queues';

	let events = $state<JobEvent[]>([]);

	$effect(() => {
		const subscription = watchJobEvents('ai-analysis', jobId, {
			onEvent: (event) => events.push(event),
			onTransportError: () => {
				// EventSource reconnects automatically; surface a hint if needed.
			}
		});

		return () => subscription.close();
	});
</script>
```

The helper closes its `EventSource` on terminal events. If you use `EventSource` directly, do the same: the server closing the response otherwise makes the browser reconnect forever.

### Boundaries

- Routes validate `queue` with `isQueueName` and stay thin.
- Services call the queue module; workers consume jobs and call services. Neither imports repositories of another module.
- The SSE helper lives in `src/lib/queues` (shared contract + browser helper). Implementation lives in `src/lib/server/common/queues` and must not be imported by UI code.
