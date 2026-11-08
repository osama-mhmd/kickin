# Modules

KickIn has two kinds of modules. They look similar on disk, but they have different jobs and different rules.

|                 | **Database module**                                   | **Common module**                                               |
| --------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Location        | `src/lib/server/modules/<name>/`                      | `src/lib/server/common/<name>/`                                 |
| Job             | Own one part of the product's data and business rules | Wrap an external API or a deep, reusable capability             |
| Talks to        | PostgreSQL through Drizzle                            | GitHub, AI providers, tarballs, ASTs, …                         |
| Typical files   | `repo.ts`, `service.ts`, `types.ts`, `index.ts`       | `client/`, `errors.ts`, `types.ts`, feature folders, `index.ts` |
| Called by       | SvelteKit server layer, workers                       | Services, workers                                               |
| Database access | Yes — only in `repo.ts`                               | No                                                              |
| Business logic  | Yes — in `service.ts`                                 | No — transport and parsing only                                 |

Both kinds follow the same dependency direction:

```
repositories → services → SvelteKit server layer → UI
                     ↖ common modules
```

A common module may be called by a service. A service may call a repository. Neither a service nor a common module may import SvelteKit-only modules (`$app/*`, `$env/*`), because workers reuse them outside Vite. Read configuration from `src/lib/server/config.ts`. That file loads `.env` when present (existing environment variables win), so the web app and workers read the same values without depending on Vite.

## Which kind should I build?

- Does the code talk to a database table? → **database module**.
- Does the code talk to an outside service, parse a file format, or provide a reusable technical capability? → **common module**.
- Does the code combine both (for example, "fetch a repo from GitHub and cache its computation in Postgres")? → that is a **service** in a database module. The service calls the common GitHub module and then its own repository.

Never put database calls in a common module. Never put GitHub/AI HTTP calls directly in a repository. The layers exist so workers, tests, and the web app can reuse the same code safely.

---

## Database modules

A database module is the standard home for a product feature that persists data.

```
src/lib/server/modules/
  repos/
    repo.ts       # Drizzle queries only. No business logic.
    service.ts    # Business rules. Calls repo.ts and common modules.
    types.ts      # Module-level types shared by the service and server layer.
    index.ts      # Public surface. Re-export what callers may use.
```

### Rules

- `repo.ts` is the only file that imports Drizzle or the `db` object. It has no branching business rules.
- `service.ts` owns decisions, validation of business invariants, idempotency, and orchestration. It returns typed results or throws typed errors.
- The SvelteKit server layer stays thin: validate input with zod, call one service function, return the result.
- Workers import services, never repositories.
- Add `*.test.ts` next to the code and cover the service logic and any repository edge cases.

### Adding a database module

1. Create the folder under `src/lib/server/modules/<name>/`.
2. Add or extend the Drizzle schema in `src/lib/server/db/schema.ts`.
3. Write `repo.ts` with small, named functions (`findById`, `upsert`, `listByRepo`, …).
4. Write `service.ts` with the product behavior. Call common modules for external data.
5. Export the deliberately public API from `index.ts`. Do not export `repo.ts`.
6. Add tests. Run `pnpm test`, `pnpm typecheck`, and `pnpm lint`.

---

## Common modules

A common module wraps an external dependency or a deep technical capability. It is infrastructure, not product behavior.

```
src/lib/server/common/
  github/
    client/       # Transport: auth, headers, timeouts, errors, URL building
    types.ts      # Public data and option types
    errors.ts     # Typed errors
    repositories/ # Repository endpoints
    issues/       # Issue endpoints
    tarballs/     # Tarball streaming and download
    testing/      # Shared test fixtures
    index.ts      # Public API + factory
```

### Rules

- One client owns transport concerns: base URL, authentication, headers, timeouts, retries, and error mapping. Feature files must not duplicate that code.
- Read secrets and configuration through `src/lib/server/config.ts`. Never read `process.env` in feature files.
- Import nothing from SvelteKit (`$app/*`, `$env/*`). Workers must be able to import the module.
- Never import repositories or the database.
- Accept an injected `fetch` for controlled unit tests and custom transports. Live integration tests must still hit the real API.
- Errors are typed classes, not strings. Callers switch on `instanceof` and `code`.
- Return plain data (arrays, records, streams) and small result objects. No SvelteKit `Response` leaks into services.
- Export a barrel `index.ts` and a factory. A factory makes the module easy to instantiate in tests and workers; a lazily created default instance keeps application code short.
- Every new capability gets tests, and this document gets a short usage note.

### Adding to the GitHub module

The GitHub module is the reference implementation for common modules. Extend it by adding a feature folder, not by patching HTTP logic into an existing one:

1. Add a folder such as `comments/` with an `index.ts` that takes a `GitHubClient` as its first argument.
2. Call `client.requestJson` for JSON endpoints or `client.request` for streams and binary responses.
3. Add the data and option types to `types.ts`.
4. Re-export the function from the root `index.ts` and add it to the matching namespace in `createGitHubModule`.
5. Add a no-network test next to the feature using an injected `fetch`.
6. Document the new function here.

The client exposes the lower-level surface on purpose: `request`, `requestJson`, `requestJsonWithMeta`, `parseLinkHeader`, and the normalized repository reference helper. Reuse them instead of reimplementing auth, pagination, or error handling.

---

## GitHub module reference

**Configuration:** `GITHUB_TOKEN`. The default module reads it through `config.githubToken`. If it is missing, constructing the client throws `GitHubConfigurationError`. Tokens are never logged.

**Import path:** `$lib/server/common/github` in the SvelteKit app, or a relative import from workers.

### Quick start

```ts
import { getGitHubModule } from '$lib/server/common/github';

const github = getGitHubModule();

const repo = await github.repositories.get('sveltejs/svelte');
const stars = await github.repositories.getStars('sveltejs/svelte');
const issues = await github.issues.list('sveltejs/svelte', {
	limit: 10,
	offset: 20,
	state: 'open',
	labels: ['good first issue']
});
const tarball = await github.tarballs.fetch('sveltejs/svelte', { ref: 'main' });
const downloaded = await github.tarballs.download('sveltejs/svelte', '/tmp', { ref: 'main' });
```

`createGitHubModule(options)` is the testable/worker-friendly form. It accepts `token`, `baseUrl`, `userAgent`, `apiVersion`, `timeoutMs`, and `fetch`.

```ts
import { createGitHubModule } from './common/github';

const github = createGitHubModule({
	token: 'ghp_...',
	fetch: myFakeFetch
});
```

The standalone functions are also public if you prefer explicit dependencies:

```ts
import { GitHubClient, listIssues } from './common/github';

const client = new GitHubClient({ token: 'ghp_...' });
const issues = await listIssues(client, { owner: 'sveltejs', name: 'svelte' }, { limit: 1 });
```

### Repository references

Every function accepts either `"owner/name"` or `{ owner, name }`. Invalid references throw `GitHubValidationError`. Use `normalizeRepositoryRef()` when you need to split the value yourself.

### Issues

`github.issues.list(ref, options)` returns `GitHubIssue[]`.

| Option                | Default        | Notes                                                                           |
| --------------------- | -------------- | ------------------------------------------------------------------------------- |
| `limit`               | `30`           | Integer `1`–`1000`. Fetching continues across pages.                            |
| `offset`              | `0`            | Skips matching issues. Applied after pull requests are filtered out by default. |
| `state`               | `"open"`       | `"open"`, `"closed"`, or `"all"`.                                               |
| `labels`              | —              | A label or array of labels, sent comma-separated.                               |
| `sort`                | GitHub default | `"created"`, `"updated"`, or `"comments"`.                                      |
| `direction`           | GitHub default | `"asc"` or `"desc"`.                                                            |
| `since`               | —              | ISO timestamp.                                                                  |
| `includePullRequests` | `false`        | GitHub's issue endpoint includes PRs. They are removed unless this is `true`.   |
| `signal`              | —              | `AbortSignal` for cancellation.                                                 |

Pagination is hidden: the function requests pages of 100, follows the `Link: rel="next"` header, and returns exactly what the caller asked for (or fewer if there are no more issues). When `includePullRequests` is `false`, `offset` counts issues only, which may require scanning earlier pages.

### Tarballs

- `fetchRepositoryTarball(client, ref, { ref, signal })` returns a `RepositoryTarball` with a web `stream`, content type, content length, ETag, filename, and final URL. Use this when streaming into a queue/worker.
- `downloadRepositoryTarball(client, ref, destination, options)` streams to disk. If `destination` is an existing directory or ends with `/`, the file is written inside it using `options.filename`, the GitHub filename, or `owner-name-ref.tar.gz`. Otherwise `destination` is treated as the file path. Writes go to a temporary file and are renamed into place.
- Set `overwrite: false` to make an existing file an error.
- Downloads are streamed; the tarball is never buffered in memory.

### Errors

All errors extend `GitHubError` and carry `code`, `status`, `requestUrl`, and `details` where applicable.

| Class                      | When                                                                          |
| -------------------------- | ----------------------------------------------------------------------------- |
| `GitHubConfigurationError` | Missing `GITHUB_TOKEN` or invalid client setup.                               |
| `GitHubValidationError`    | Bad repository reference, limit, offset, or download destination.             |
| `GitHubNetworkError`       | Timeout, DNS failure, aborted connection.                                     |
| `GitHubApiError`           | Non-2xx response. `isNotFound` is `true` for 404.                             |
| `GitHubRateLimitError`     | 403 with exhausted quota or 429. Exposes `resetAt`, `remaining`, and `limit`. |

```ts
import { GitHubApiError, GitHubRateLimitError } from '$lib/server/common/github';

try {
	await github.issues.list('owner/repo', { limit: 100 });
} catch (error) {
	if (error instanceof GitHubRateLimitError) {
		// Schedule a retry after error.resetAt; do not hammer the API.
	} else if (error instanceof GitHubApiError && error.isNotFound) {
		// The repository or endpoint does not exist.
	} else {
		throw error;
	}
}
```

### What the GitHub module deliberately does not do

- It does not save issues to Postgres. That belongs to a database module's service.
- It does not decide which issues matter. That is product logic.
- It does not queue work. Callers/services enqueue jobs (`docs/queues.md`).
- It does not retry automatically. Queues own retry policy; callers decide whether an error is retryable.

---

## AI module reference

**Configuration:** `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, and the optional `AI_FALLBACK_CHAIN` JSON array. The module reads them through `src/lib/server/config.ts`. A provider without a key is skipped with a `configuration` failure, then the chain continues.

**Import path:** `$lib/server/common/ai` in the SvelteKit app, or a relative import from workers.

### Quick start

```ts
import { z } from 'zod';
import { getAiModule } from '$lib/server/common/ai';

const ai = getAiModule();

// Direct interaction: message + history + rules in, text out.
const answer = await ai.ask({
	message: 'Explain this issue in one paragraph.',
	history: [
		{ role: 'user', content: 'Earlier question' },
		{ role: 'assistant', content: 'Earlier answer' }
	],
	rules: 'You are helping a maintainer triage GitHub issues.'
});

// Packed question: strict JSON, schema, semantic checks, anti-optimism rules.
const Verdict = z.object({
	triage: z.enum(['remove', 'clarify', 'delegate']),
	reason: z.string().max(400),
	evidence: z.array(z.string()).min(1).max(5),
	risks: z.array(z.string()).min(1).max(5)
});

const verdict = await ai.askJson({
	message: issuePrompt,
	rules: 'Use the triage rubric in docs/ai-analysis.md.',
	schema: Verdict,
	checks: (value) => (value.evidence.length > 0 ? [] : ['evidence must not be empty'])
});

console.log(verdict.value.triage, verdict.provider, verdict.model);
```

`createAiModule(options)` is the testable/worker-friendly form. It accepts `chain`, `apiKeys`, `fetch`, `timeoutMs`, `temperature`, and `maxRepairAttempts`. Tests inject a fake `fetch`; production should use the default module.

### `ask` vs `askJson`

|                 | `ask`                            | `askJson`                                      |
| --------------- | -------------------------------- | ---------------------------------------------- |
| Input           | `message`, `history`, `rules`    | same as `ask`                                  |
| Output          | text                             | text + schema-validated `value`                |
| Validation      | none beyond a non-empty response | strict JSON, zod schema, optional `checks`     |
| Repair          | —                                | one repair per model (then fallback)           |
| Built-in prompt | caller rules only                | caller rules + skeptical rules + JSON contract |

`askJson` never returns raw, unvalidated model text. Invalid JSON, schema mismatches, and failed `checks` are repairable: the module sends the rejection reasons back once, then moves to the next model. Set `honesty: false` only when a caller supplies an equivalent skeptical prompt; set `repairs` to change the per-model repair count.

`checks` run on the parsed value, not on the raw text. Returning one or more messages rejects the answer and triggers a repair. Use them for business rules that zod cannot express (for example, "confidence must be low when evidence is thin").

### Fallback and failures

The chain is an ordered list of `{ provider, model, rpm?, maxTokens?, timeoutMs? }`. On a provider error, timeout, 429, malformed provider envelope, or invalid JSON/schema after repairs, the module moves to the next entry. It never retries the same model for transport failures; queues own backoff and retries. When the chain is exhausted it throws `AiExhaustedError` with every `AiAttempt`.

Errors are typed classes extending `AiError`: `AiConfigurationError`, `AiValidationError`, `AiProviderError`, `AiRateLimitError`, `AiTimeoutError`, `AiAbortedError`, `AiInvalidResponseError`, `AiInvalidJsonError`, `AiSchemaError`, `AiCheckError`, and `AiExhaustedError`. Switch on `instanceof` and `code`.

### Attempt events and SSE

`ask`/`askJson` accept `onEvent` and return `attempts` metadata. For streaming, use the async generators:

```ts
const events = ai.streamAskJson({ message, schema, rules });
```

They yield `attempt`, `failure`, `repair`, `fallback`, `success`, and `exhausted`. A `success` event carries the answer: `text` for `streamAsk`, `value` for `streamAskJson`. The terminal events close the stream.

`POST /api/ai/ask` implements that transport for the app. It validates `{ message, history?, rules?, format?, temperature?, maxTokens? }` with zod, streams SSE, and returns `503` when no provider is configured. `format: "json"` guarantees strict JSON but no domain schema; a product feature should add its own route with a domain schema instead of using this generic endpoint.

```ts
import { createAiEventStream, getAiModule } from '$lib/server/common/ai';

export const POST = ({ request }) => {
	const events = getAiModule().streamAskJson({ message: '…', schema });
	const body = createAiEventStream(events, { signal: request.signal });

	return new Response(body, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
```

The browser helpers live in `$lib/ai/events`:

- `watchAiEvents(url, { onEvent })` uses `EventSource` for GET streams and closes it on `success` or `exhausted`.
- `requestAiEvents(url, body, { onEvent })` POSTs a JSON body and parses the SSE response with `fetch`, because prompts do not belong in query strings. It also stops after a terminal event. Both return an abortable promise; pass `signal` to cancel.

### Boundaries

- No database, queue, or SvelteKit imports. Workers can use the module directly.
- AI HTTP calls stay in `providers/`; the client owns fallback, validation, and events.
- Callers own prompt content and domain schemas (`docs/ai-analysis.md`). The module only supplies generic skepticism and the JSON contract.
- Store `AI_PROMPT_VERSION` alongside analysis rows so prompt changes are traceable.
- `rpm` is metadata for queue rate limiting; the module does not throttle on its own.

---

## Tests

- `pnpm test` runs every `src/**/*.test.ts` with Vitest, including the live integration tests.
- `pnpm test:unit` skips the `*.integration.test.ts` files.
- `pnpm test:integration` runs only the `*.integration.test.ts` files.
- `pnpm test:watch` keeps Vitest running in watch mode.
- User-facing integration tests start a real `node:http` server and drive the route's `POST` handler over an actual socket, including SSE streams. They do not stub SvelteKit.
- GitHub integration tests require `GITHUB_TOKEN` and hit the real GitHub API. They verify the actual contract against `osama-mhmd/kickin` (repository, stars, tarball streaming/download) and `sveltejs/svelte` (issue listing, pagination, offset, PR filtering). They are not mocked.
- AI live-provider tests are opt-in: set `AI_INTEGRATION=1` and at least one of `GROQ_API_KEY`, `GEMINI_API_KEY`, or `OPENROUTER_API_KEY`. They verify text, strict JSON, and a terminal `success` event against the real free-tier chain.
- Unit tests inject a fake `fetch` for edge cases that are hard to trigger against the live API: rate limits, page-boundary pagination, invalid repository references, and overwrite protection.
- Database module tests focus on service behavior. Repositories are thin and can be covered with integration tests when a database is available.

## Checklist for a new module or capability

- [ ] Chose the right kind: database module vs common module.
- [ ] Kept the dependency direction (no upward imports, no SvelteKit imports in server modules).
- [ ] Config comes from `src/lib/server/config.ts`.
- [ ] Errors are typed; no thrown strings.
- [ ] Public API is exported from `index.ts`; internals stay private.
- [ ] A factory or injectable dependency makes it testable.
- [ ] Tests added and run with `pnpm test`.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] This document updated when the module's public behavior changes.
