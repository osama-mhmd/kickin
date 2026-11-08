import { z } from 'zod';
import { config } from '../../config';
import { AiConfigurationError } from './errors';
import type { AiModelConfig } from './types';

/**
 * Starting point from `docs/free-models.md`. This is data, not logic: override
 * it with the `AI_FALLBACK_CHAIN` env var without changing code. Verify the
 * free models monthly; free tiers rotate fast.
 */
export const defaultAiChain: readonly AiModelConfig[] = [
	{ provider: 'groq', model: 'openai/gpt-oss-120b', rpm: 30, maxTokens: 4096 },
	{ provider: 'gemini', model: 'gemini-2.5-flash', rpm: 10, maxTokens: 4096 },
	{ provider: 'openrouter', model: 'qwen/qwen3-coder:free', rpm: 20, maxTokens: 4096 },
	{
		provider: 'openrouter',
		model: 'meta-llama/llama-3.3-70b-instruct:free',
		rpm: 20,
		maxTokens: 4096
	},
	{ provider: 'groq', model: 'llama-3.3-70b-versatile', rpm: 30, maxTokens: 4096 }
];

const modelSchema = z.object({
	provider: z.enum(['groq', 'gemini', 'openrouter']),
	model: z.string().trim().min(1),
	rpm: z.number().positive().optional(),
	maxTokens: z.number().int().positive().optional(),
	timeoutMs: z.number().int().positive().optional()
});

const chainSchema = z.array(modelSchema).min(1);

export function parseAiChain(raw: string | undefined): AiModelConfig[] {
	if (raw === undefined) return defaultAiChain.map((entry) => ({ ...entry }));

	let parsed: unknown;

	try {
		parsed = JSON.parse(raw) as unknown;
	} catch (cause) {
		throw new AiConfigurationError('AI_FALLBACK_CHAIN is not valid JSON.', { cause });
	}

	const result = chainSchema.safeParse(parsed);

	if (!result.success) {
		throw new AiConfigurationError('AI_FALLBACK_CHAIN does not match the expected shape.', {
			details: result.error.issues
		});
	}

	return result.data;
}

export function resolveAiChain(raw: string | undefined = config.aiFallbackChain): AiModelConfig[] {
	return parseAiChain(raw);
}
