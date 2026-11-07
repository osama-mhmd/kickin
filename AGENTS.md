# AGENTS.md

Instructions for AI coding agents working on KickIn. Humans: see [README.md](README.md).
Keep this file short. Deeper detail is in `docs/`; read the relevant doc before touching that area.

## What this project is

KickIn recommends open-source issues to contributors (matched to their profile) and triages issues for maintainers (remove / clarify / delegate). Background jobs do the heavy work: repo computation, then AI analysis.

## Stack

SvelteKit · TypeScript (strict) · Tailwind CSS · Drizzle ORM · PostgreSQL · BullMQ on Upstash Redis.

## Commands

```bash
pnpm dev            # web app
pnpm worker         # BullMQ workers (separate long-running process)
pnpm typecheck      # tsc --noEmit
pnpm lint
pnpm test
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate
```

Run `pnpm typecheck && pnpm lint && pnpm test` before finishing a task.

## Architecture rules (strict layering)

Dependencies point one way only:

`repositories → services → SvelteKit server layer → UI`

- **Repositories**: the only code that touches Drizzle/DB. No business logic.
- **Services**: business logic. Call repositories and external APIs (GitHub, AI). Must not import SvelteKit-only modules (`$app/*`, `$env/*`), because workers run outside Vite and reuse them. Read config via `src/lib/server/config.ts`.
- **SvelteKit server layer** (`+page.server.ts` load functions and form actions, `+server.ts` endpoints): thin. Validate input (zod), call a service, return a result. No direct DB access.
- **UI**: Svelte components get data from `load` and submit via form actions. Never import repositories or services.
- **Workers** are a sibling of the server layer: they call services, never repositories directly.

Never skip a layer, and never import upward. Server-only code lives in `src/lib/server/`.

## Non-negotiables

- **AI output must be strict JSON**, validated with zod before use. Never trust or render raw model text. Schema and rules: `docs/ai-analysis.md`.
- **Never block a request on slow work.** Repo computation and AI calls go through queues (`docs/queues.md`).
- **Repo computation is cached per repo/commit.** Check for an existing computation before enqueuing a new one.
- **Download repos as tarballs.** Do not `git clone`.
- **Jobs must be idempotent** and safe to retry. Use deterministic job IDs.
- **Free-tier AI only.** Do not add paid providers or hardcode a single model; use the fallback chain in `docs/free-models.md`.
- **Do not be optimistic in prompts or scoring.** Skepticism is a feature (`docs/ai-analysis.md`).
- Secrets come from env vars only. Never commit keys or log tokens.

## UI conventions

- Dark theme, zinc-950 base, styled with Tailwind CSS. Reuse existing components before creating new ones.
- Load data in `+page.server.ts`; keep components presentational.

## Code style

- TypeScript strict, no `any`. Prefer named exports. Small, single-purpose functions.
- Errors from services are typed results or typed errors, not thrown strings.
- Add or update tests for every service and worker you touch.

## When unsure

Ask, or leave a `TODO(question):` comment, rather than inventing product behavior. Open product decisions are listed at the bottom of `docs/architecture.md`.

## Docs map

- `docs/architecture.md`: layers, folder layout, data model, full flow
- `docs/queues.md`: queues, workers, retries, rate limits
- `docs/repo-computation.md`: tarball + hierarchy extraction
- `docs/ai-analysis.md`: prompt contract, JSON schema, anti-optimism
- `docs/free-models.md`: providers, limits, fallbacks
