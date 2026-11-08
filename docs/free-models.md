# Free models

KickIn only uses free tiers. **This list goes stale fast**: free models rotate in and out, sometimes within days. Treat model IDs below as examples, load the active chain from config (not hardcoded), and re-verify monthly. Last researched: 2026-11-07.

## Providers

### 1. OpenRouter (primary breadth)

- No credit card needed; models with the `:free` suffix cost $0 per token. Limits are by request volume, not tokens.
- `openrouter/free` is a router that picks a random currently-free model. Convenient for tests, but behavior varies between calls, so **do not use it as the main production path** for strict JSON.
- Use the `models` array to send an ordered list of free fallbacks in one request.
- Examples seen in current guides (verify before use): `qwen/qwen3-coder:free`, DeepSeek R1 (free), various Llama and Qwen models, Gemma models. Roughly 15–25 free models at any time.
- Catalog: <https://openrouter.ai/models?pricing=free>

### 2. Google Gemini API (free tier)

- No billing needed. Flash and Flash-Lite models are free; Pro models have largely left the free tier (sources conflict on 2.5 Pro, so check the pricing page).
- Per-model RPM/RPD are no longer published in the docs; see your project's limits in Google AI Studio.
- Limits apply per project, not per key, so extra keys do not add quota.
- Free-tier content may be used by Google to improve its products.
- Docs: <https://ai.google.dev/gemini-api/docs/rate-limits>

### 3. Groq (fast inference)

- Free plan, no credit card, limits are per organization and per model.
- Models listed on Groq's free tier in recent sources: `llama-3.1-8b-instant`, `llama-3.3-70b-versatile`, `openai/gpt-oss-20b`, `openai/gpt-oss-120b`.
- Published sample for gpt-oss-120b: 30 requests/min, 1,000 requests/day, 8,000 tokens/min, 200,000 tokens/day. The console limits page is authoritative.
- Docs: <https://console.groq.com/docs/rate-limits>

## Suggested fallback chain (starting point)

Order by JSON reliability first, speed second:

1. Groq `openai/gpt-oss-120b`
2. Gemini Flash (current free Flash model)
3. OpenRouter free model A (for example Qwen) via `models` array
4. OpenRouter free model B (for example Llama / DeepSeek)
5. Groq `llama-3.3-70b-versatile`

Swap entries freely; the chain lives in config, one entry per `{provider, model, rpm, maxTokens}`.

The AI common module (`src/lib/server/common/ai`) implements this chain. Its default is data in `chain.ts`; override it without touching logic by setting `AI_FALLBACK_CHAIN` to a JSON array of the same entries. Providers without a key are skipped, so `.env` can hold only the keys you actually have.

## Rules

- Chain config is data, not code. Adding or removing a model must not need a deploy of logic.
- BullMQ rate limit for `ai-analysis` follows the **slowest** provider in the chain.
- Track per-model: success rate, JSON-valid rate, latency, rating inflation. Drop models that fail validation often.
- Free tiers are a "may disappear tomorrow" dependency: the app must degrade to "analysis queued/delayed" and never to a wrong answer.
- Respect each provider's terms; do not rotate many accounts to dodge limits.
