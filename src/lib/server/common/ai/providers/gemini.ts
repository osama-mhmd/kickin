import { z } from 'zod';
import { AiInvalidResponseError } from '../errors';
import type { AiMessage, ProviderRequest, ProviderResponse } from '../types';
import { postJson } from './transport';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const partSchema = z.object({
	text: z.string().optional(),
	thought: z.boolean().optional()
});

const responseSchema = z.object({
	candidates: z
		.array(
			z.object({
				content: z
					.object({
						parts: z.array(partSchema).optional()
					})
					.optional(),
				finishReason: z.string().optional()
			})
		)
		.min(1),
	promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
	usageMetadata: z
		.object({
			promptTokenCount: z.number().optional(),
			candidatesTokenCount: z.number().optional()
		})
		.optional()
});

interface GeminiContent {
	role: 'user' | 'model';
	parts: { text: string }[];
}

export async function callGemini(request: ProviderRequest): Promise<ProviderResponse> {
	const systemText = request.messages
		.filter((message) => message.role === 'system')
		.map((message) => message.content)
		.join('\n\n');
	const contents = toGeminiContents(request.messages);

	const raw = await postJson({
		provider: request.provider,
		model: request.model,
		url: `${GEMINI_BASE_URL}/models/${encodeURIComponent(request.model)}:generateContent`,
		body: {
			contents,
			...(systemText.length > 0 ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
			generationConfig: {
				temperature: request.temperature,
				...(request.maxTokens === undefined ? {} : { maxOutputTokens: request.maxTokens })
			}
		},
		headers: { 'x-goog-api-key': request.apiKey },
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

	const blockReason = parsed.data.promptFeedback?.blockReason;

	if (blockReason) {
		throw new AiInvalidResponseError(`AI provider blocked the request: ${blockReason}.`, {
			provider: request.provider,
			model: request.model,
			details: parsed.data.promptFeedback
		});
	}

	const text =
		parsed.data.candidates[0].content?.parts
			?.filter((part) => part.thought !== true)
			.map((part) => part.text ?? '')
			.join('') ?? '';

	if (text.trim().length === 0) {
		throw new AiInvalidResponseError('AI provider returned an empty message.', {
			provider: request.provider,
			model: request.model
		});
	}

	return {
		text,
		usage: {
			inputTokens: parsed.data.usageMetadata?.promptTokenCount,
			outputTokens: parsed.data.usageMetadata?.candidatesTokenCount
		}
	};
}

/** Gemini requires `model` instead of `assistant`; merge adjacent same-role turns. */
function toGeminiContents(messages: AiMessage[]): GeminiContent[] {
	const contents: GeminiContent[] = [];

	for (const message of messages) {
		if (message.role === 'system') continue;

		const role = message.role === 'assistant' ? 'model' : 'user';
		const last = contents.at(-1);

		if (last && last.role === role) {
			last.parts.push({ text: message.content });
		} else {
			contents.push({ role, parts: [{ text: message.content }] });
		}
	}

	return contents;
}
