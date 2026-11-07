# Architecture

## Layers

```
UI (Svelte components + Tailwind)
  └─ gets data from / submits to → SvelteKit server layer
               (+page.server.ts load + form actions, +server.ts endpoints:
                validate input, call one service)
               └─ calls → Services     (business logic, GitHub + AI clients)
                            └─ calls → Repositories (Drizzle, the only DB access)
Workers (BullMQ consumers) ─ call → Services
```

Rules are enforced by convention and, ideally, by lint (`no-restricted-imports`):

- UI never imports services or repositories.
- The server layer never imports repositories.
- Repositories never import services.
- Services, repositories and queues never import SvelteKit-only modules (`$app/*`, `$env/*`), because workers run outside Vite. Config is read through `src/lib/server/config.ts`.

Note: the `$lib` alias only exists inside Vite. Worker entrypoints should use relative imports (or `tsconfig` paths with a runner such as `tsx`) to reach `src/lib/server/`.

## Proposed folder layout

```
src/
  routes/                 # pages, +page.server.ts (load + form actions), +server.ts endpoints
  lib/
    components/           # UI (Svelte + Tailwind)
    schemas/              # zod schemas shared by server layer and workers
    server/               # server-only code ($lib/server)
      config.ts           # env access (no $env imports, so workers can use it)
      services/
        profile.service.ts
        repo-computation.service.ts
        issue.service.ts
        analysis.service.ts
        ai/               # provider clients + fallback chain
        github/           # GitHub API client
      repositories/
      db/                 # drizzle schema + migrations
      queues/
        connection.ts     # Upstash/BullMQ connection
        repo-computation.queue.ts
        ai-analysis.queue.ts
  workers/                # worker entrypoints (run via `pnpm worker`)
docs/
```

## Data model (draft)

| Table               | Key fields                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `users`             | id, github_id, github_username                                                                                                |
| `user_profiles`     | user_id, languages[], stack[], strengths[], hours_per_week                                                                    |
| `repos`             | id, owner, name, default_branch, latest_computed_sha                                                                          |
| `repo_computations` | id, repo_id, commit_sha, status, hierarchy (jsonb), computed_at                                                               |
| `issues`            | id, repo_id, github_number, title, body, labels[], state, fetched_at                                                          |
| `issue_discussions` | issue_id, comments (jsonb) or normalized rows                                                                                 |
| `issue_analyses`    | id, issue_id, user_id (nullable for maintainer view), triage_bucket, rating, reasoning, requested_files[], model_used, status |

`repo_computations` is unique on `(repo_id, commit_sha)`; that is the cache key.

## End-to-end flow

1. User signs in with GitHub and fills in their profile.
2. User submits a repo (`owner/name`).
3. Service checks `repo_computations` for a usable computation.
   - Missing/stale → enqueue **repo-computation** job, return a "processing" state to the UI.
4. When computation completes, fetch the desired issues from GitHub and store them.
5. Enqueue one **ai-analysis** job per issue (per user, for contributor mode).
6. AI worker sends profile + issue context + repo hierarchy → validates JSON response.
   - `needs_files` → fetch those files, re-enqueue / continue with a second pass.
   - `verdict` → store triage bucket and rating.
7. UI polls or streams status and shows ranked results.

## Open decisions

- Worker hosting. BullMQ needs a long-running process, which serverless web hosting cannot provide. Pick a free/cheap host for `pnpm worker`.
- Staleness policy for computations (re-compute every N days, or when default-branch SHA changes).
- Issue selection: which issues to fetch (open only? label filters? cap per repo?).
- How "time available" influences ranking (deterministic filter vs. prompt input).
- Auth details (GitHub OAuth scopes) and whether maintainers must prove repo ownership for the triage view.
- Whether AST parsing (for example tree-sitter) is needed beyond the file tree in v1.
