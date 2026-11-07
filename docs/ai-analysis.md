# AI analysis

The AI analyzer is the consumer of the `ai-analysis` queue. For each issue it receives:

1. **User profile** (contributor mode): languages, stack, strengths, available time
2. **Issue context**: title, body, labels, discussion/comments
3. **Repo hierarchy**: from the repo computation

It must answer in **strict JSON**. Nothing else is accepted.

## Two-pass protocol

**Pass 1.** The model sees the issue and hierarchy. It returns either:

- `needs_files`: a list of file paths it wants to read before deciding, or
- `verdict`: a final decision.

**Pass 2** (only if files were requested). The requested files' contents are fetched from GitHub and added; the model must now return a `verdict`. No further file requests. Max 2 passes.

## Response schema (draft)

```ts
const NeedsFiles = z.object({
  type: z.literal("needs_files"),
  files: z.array(z.string()).min(1).max(5),   // must exist in the hierarchy
  reason: z.string().max(300),
});

const Verdict = z.object({
  type: z.literal("verdict"),
  triage: z.enum(["remove", "clarify", "delegate"]),
  triageReason: z.string().max(400),
  // contributor mode only:
  fit: z.object({
    rating: z.number().int().min(0).max(10),
    confidence: z.enum(["low", "medium", "high"]),
    evidence: z.array(z.string()).min(1).max(5),   // concrete facts from the issue/repo
    risks: z.array(z.string()).min(1).max(5),      // reasons this could go wrong; must be non-empty
    estimatedHours: z.number().min(0.5).max(80),
  }).optional(),
  // maintainer mode only:
  suggestedLabels: z.array(z.string()).max(6).optional(),
  clarifyingQuestions: z.array(z.string()).max(4).optional(),
});

const AiResponse = z.discriminatedUnion("type", [NeedsFiles, Verdict]);
```

Validate with zod. Additionally check that every requested file path exists in the stored hierarchy; reject hallucinated paths.

## Triage meaning

| Bucket     | Use when                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `remove`   | No usable context, not a real bug, spam, or low-effort / AI-generated content.                                        |
| `clarify`  | Possibly valid, but missing reproduction steps, expected behavior, versions, or scope. Provide `clarifyingQuestions`. |
| `delegate` | Clear and actionable. Provide `suggestedLabels` and an explanation others can act on.                                 |

The rough ~10% / ~30% / rest split is a sanity check on aggregate output, **not a quota**. Never force an issue into a bucket to hit a number.

## Dealing with AI optimism

Models tend to be agreeable and to over-rate fit. Mitigations, in order of importance:

1. **Skeptical system prompt.** Tell the model that most issues are _not_ a good fit, that a high rating must be earned with evidence, and that "unclear" beats "probably fine."
2. **Rubric with anchors.** Define what each rating means (for example 9–10: exact language/stack match, clear scope, files identified, under the user's time budget; 5: partial match or ambiguity; 0–2: poor context or mismatch). Anchors reduce drift.
3. **Mandatory `risks` and `evidence`.** If the model cannot cite concrete evidence, the rating is capped.
4. **Deterministic pre-checks outside the model.** Language overlap, label presence, issue age, linked PRs, and the estimated time versus the user's time budget are computed in code and combined with the AI score. The model never has the last word alone.
5. **Server-side clamping.** Cap the rating when `confidence` is `low`, evidence is thin, or the issue already has an open linked PR / assignee.
6. **Low temperature** and a fixed JSON schema; no free-form prose.
7. **Calibration over time.** Keep a small labeled set of issues (maintainer decisions) and measure rating inflation per model. Different free models inflate differently; track it and adjust the clamp per model.

## Failure handling

- Invalid JSON → one repair retry, then `failed`.
- Provider error/timeout/429 → next model in the fallback chain (`free-models.md`).
- Never store or display unvalidated model output.

## Privacy note

Several free-tier providers may use prompts to improve their products. Send only public issue/repo data and the minimal profile fields needed (languages, stack, hours), never emails, tokens, or private repo content.
