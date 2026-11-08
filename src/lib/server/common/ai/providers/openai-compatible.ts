import { z } from 'zod';
import { AiInvalidResponseError } from '../errors';
import type { ProviderRequest, ProviderResponse } from '../types';
import { postJson } from './transport';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const contentPart = z.object({ text: z.string() });

const responseSchema = z.object({
	choices: z
		.array(
			z.object({
				message: z.object({
					content: z.union([z.string(), z.array(contentPart)]).nullable()
				})
			})
		)
		.min(1),
	usage: z
		.object({
			prompt_tokens: z.number().optional(),
			completion_tokens: z.number().optional()
		})
		.optional()
});

export async function callOpenAiCompatible(
	request: ProviderRequest,
	baseUrl: string
): Promise<ProviderResponse> {
	const raw = await postJson({
		provider: request.provider,
		model: request.model,
		url: `${baseUrl}/chat/completions`,
		body: {
			model: request.model,
			messages: request.messages,
			temperature: request.temperature,
			...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
			stream: false
		},
		headers: { authorization: `Bearer ${request.apiKey}` },
		timeoutMs: request.timeoutMs,
		fetch: request.fetch,
		signal: request.signal
	});

	const parsed = responseSchema.safeParse(raw);

	if (!parsed.success) {
		throw new AiInvalidResponseError('AI provider returned an unexpected response shape.', {
			provider: request.provider,
			model: request.model,
			details: parsed.error.issues
		});
	}

	const content = parsed.data.choices[0].message.content;
	const text = Array.isArray(content) ? content.map((part) => part.text).join('') : content;

	if (text === null || text.trim().length === 0) {
		throw new AiInvalidResponseError('AI provider returned an empty message.', {
			provider: request.provider,
			model: request.model
		});
	}

	return {
		text,
		usage: {
			inputTokens: parsed.data.usage?.prompt_tokens,
			outputTokens: parsed.data.usage?.completion_tokens
		}
	};
}
