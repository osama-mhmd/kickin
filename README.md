# KickIn

**Stop scrolling through issues. Kick in on the right one.**

KickIn helps people and projects meet in the middle of open source:

- **For contributors**: it recommends GitHub issues that fit _you_: your languages, stack, strengths, and the time you actually have.
- **For maintainers**: it triages a repository's issue backlog so you can see, at a glance, what to close, what to clarify, and what is ready to hand off.

> Status: early development. See [Roadmap](#roadmap).

---

## The problem

**Contributors** waste hours scrolling `good first issue` lists, opening issues that turn out to be vague, stale, already half-solved, or far outside their skill set. Many give up before writing a single line of code.

**Maintainers** drown in issues. A large share arrive with almost no context, are not real bugs, or are low-effort / AI-generated noise. The rest need different kinds of attention, and sorting them by hand does not scale.

## How KickIn helps

### For contributors

1. Sign in and fill in your profile: languages, stack, GitHub profile, available time.
2. Enter the repository you want to contribute to.
3. KickIn analyzes the repo's open issues against your profile and returns a ranked list, each with a suitability rating and a short, honest explanation.

### For maintainers

KickIn sorts every analyzed issue into one of three buckets:

| Bucket       | Typical share\* | Meaning                                                                                      |
| ------------ | --------------- | -------------------------------------------------------------------------------------------- |
| **Remove**   | ~10%            | Too little context, not a real bug, or low-quality / AI-generated noise. Safe to close.      |
| **Clarify**  | ~30%            | Plausible, but missing information. Needs a question back to the reporter.                   |
| **Delegate** | the rest        | Well-formed. Comes with suggested labels and an explanation so a contributor can pick it up. |

\* A rough expectation used to sanity-check results, not a quota. Real repositories vary.

## How it works (short version)

```
User profile + repo name
        │
        ▼
 Repo already computed? ──no──► [Queue 1: repo computation]
        │ yes                      download tarball → file tree + hierarchy → save
        ▼
 Fetch issues from GitHub
        │
        ▼
 [Queue 2: AI analysis]
   input:  user profile + issue (body, labels, discussion) + repo hierarchy
   output: strict JSON → "I need these files" OR a verdict + rating
        │
        ▼
 Ranked recommendations / maintainer triage
```

Two ideas make this work:

1. **Repo computation.** Once per repository, KickIn downloads the source as a tarball (one compressed download, minimal disk I/O) and stores its file structure and high-level hierarchy. The AI later uses this map to know _where to look_ when judging an issue.
2. **Queues.** Computation and AI calls are slow and rate-limited, so they run as background jobs (BullMQ on Upstash Redis) instead of blocking requests.

Details live in [`docs/`](docs/).

## Tech stack

- **App**: SvelteKit, TypeScript, Tailwind CSS
- **Data**: PostgreSQL + Drizzle ORM
- **Queues**: BullMQ on Upstash (Redis)
- **AI**: free-tier model providers only (see [`docs/free-models.md`](docs/free-models.md))
- **Source data**: GitHub REST API

## Documentation

| Doc                                                    | What's inside                                            |
| ------------------------------------------------------ | -------------------------------------------------------- |
| [`docs/architecture.md`](docs/architecture.md)         | Layers, folder layout, data model, end-to-end flow       |
| [`docs/queues.md`](docs/queues.md)                     | The two queues, workers, retries, rate limiting          |
| [`docs/repo-computation.md`](docs/repo-computation.md) | Tarball download and hierarchy extraction                |
| [`docs/ai-analysis.md`](docs/ai-analysis.md)           | Prompt contract, strict JSON schema, anti-optimism rules |
| [`docs/free-models.md`](docs/free-models.md)           | Free model providers, limits, fallback strategy          |
| [`AGENTS.md`](AGENTS.md)                               | Instructions for AI coding agents                        |

## Getting started

```bash
git clone <repo-url> kickin && cd kickin
pnpm install
cp .env.example .env     # fill in the values below
pnpm db:migrate
pnpm dev                 # web app
pnpm worker              # queue workers (separate process)
```

Required environment variables (names are the planned convention):

| Variable                                               | Purpose                         |
| ------------------------------------------------------ | ------------------------------- |
| `DATABASE_URL`                                         | PostgreSQL connection string    |
| `UPSTASH_REDIS_URL`                                    | Redis connection used by BullMQ |
| `GITHUB_TOKEN` / OAuth client id + secret              | GitHub API access and sign-in   |
| `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` | Free-tier AI providers          |

## Roadmap

- [ ] Auth and contributor profile
- [ ] Repo computation pipeline (queue 1)
- [ ] Issue fetching and storage
- [ ] AI analysis pipeline (queue 2) with strict JSON validation
- [ ] Contributor recommendations UI
- [ ] Maintainer triage dashboard
- [ ] Calibration against real maintainer decisions (anti-optimism)

## Contributing

KickIn is meant to make contributing easier, so we aim to be easy to contribute to. Check the issues, read [`AGENTS.md`](AGENTS.md) and [`docs/architecture.md`](docs/architecture.md) before opening a pull request.

## License

TBD.
