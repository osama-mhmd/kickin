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

For the two kinds of modules (database modules in `modules/` and common modules in `common/`), their rules, and the GitHub module reference, see [`modules.md`](modules.md).

## Proposed folder layout

```
src/
  components/             # UI (Svelte + Tailwind)
    site/
    layout/
    ui/
  routes/                 # pages, +page.server.ts (load + form actions), +server.ts
  lib/
    schemas/              # zod schemas shared by server layer and workers
    queues/               # shared queue contract + browser EventSource helper
      types.ts
      job-events.ts
    server/               # server-only code ($lib/server)
      config.ts           # env access (no $env imports, so workers can use it)
      modules/
        users/
          service.ts
          types.ts
          repo.ts
          index.ts
        ...other
      common/
        ast-analyzer/     # analyzes the codebase from the repo URL
        ai/               # the core ai functionalities
        github/           # GitHub API client
        queues/
          connection.ts   # Upstash/BullMQ connection
          definitions/    # queue names, policy, deterministic job ids
          manager/        # the BullMQ wrapper (enqueue, status, watch)
          sse/            # job events -> text/event-stream
          index.ts
        ...other
      db/                 # drizzle schema + migrations
  workers/                # worker entrypoints (run via `pnpm worker`)
docs/
static/
  images/
```

## Data model (draft)

| Table               | Key fields / notes                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`             | id, github_id (stable, unique), github_login, name, email?, avatar_url, last_login_at                                                        |
| `github_accounts`   | user_id (PK), access_token, refresh_token?, token_expires_at, scope. Tokens are encrypted at rest.                                           |
| `sessions`          | id (hashed token, PK), user_id, expires_at, user_agent, ip_hash                                                                              |
| `profiles`          | user_id (PK), headline, hours_per_week, timezone, professional_years, opensource_years, onboarding_completed_at                              |
| `profile_languages` | (user_id, language) PK, level (beginner/intermediate/advanced/expert), years?, is_primary                                                    |
| `repositories`      | id, github_id, owner, name, default_branch, language, stars, size_kb; unique on github_id and lower(owner)+lower(name)                       |
| `repo_computations` | id, repository_id, commit_sha, branch, status, hierarchy (jsonb), file_count, algorithm_version; unique on `(repository_id, commit_sha)`     |
| `issues`            | id, repository_id, number, github_id, title, body, labels (jsonb), assignees (jsonb), state, timestamps; unique `(repository_id, number)`    |
| `issue_analyses`    | id, issue_id (unique), repo_computation_id, level (0/1/2), summary, reasoning, suggested_labels, clarifying_questions, status, input_hash    |
| `issue_matches`     | id, user_id, issue_id, issue_analysis_id, fit_rating (0–10), confidence, evidence, risks, estimated_hours, final_score; unique (user, issue) |
| `reports`           | id, user_id?, category, message, status, entity refs, resolution_note, resolved_at                                                           |
| `health_checks`     | id, target, ok, status_code, latency_ms, error, checked_at                                                                                   |
| `incidents`         | id, title, description, severity, status, started_at, resolved_at                                                                            |
| `ai_calls`          | id, provider, model, purpose, success, json_valid, latency_ms, tokens, rating, created_at                                                    |

`repo_computations` is unique on `(repository_id, commit_sha)`; that is the cache key. `branch` is metadata only, because the same commit has the same tree on every branch.

`issue_analyses` holds the user-independent verdict (`level`: 0 = remove, 1 = clarify, 2 = delegate). Only level 2 gets per-user `issue_matches`. This avoids duplicating the general verdict per user and keeps the maintainer view independent of any contributor profile.

Uptime is computed from `health_checks` (ok / total over a window), never from web request success ratios. Incidents are human-written status-page entries; user-submitted problems live in `reports`.

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
