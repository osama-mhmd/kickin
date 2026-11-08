import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { AiEvent } from '#lib/ai/types.ts';
import {
	AiConfigurationError,
	createAiEventStream,
	getAiModule
} from '#lib/server/common/ai/index.ts';
import type { RequestHandler } from './$types';

const historyMessageSchema = z.object({
	role: z.enum(['system', 'user', 'assistant']),
	content: z.string().trim().min(1).max(20_000)
});

const askSchema = z.object({
	message: z.string().trim().min(1).max(20_000),
	history: z.array(historyMessageSchema).max(50).optional(),
	rules: z
		.union([
			z.string().trim().min(1).max(10_000),
			z.array(z.string().trim().min(1).max(10_000)).min(1).max(20)
		])
		.optional(),
	format: z.enum(['text', 'json']).default('text'),
	temperature: z.number().min(0).max(2).optional(),
	maxTokens: z.number().int().positive().max(8_192).optional()
});

/**
 * AI request transport endpoint.
 *
 * The route validates input and streams the module's attempt lifecycle as SSE.
 * A product feature should add its own route with a domain schema; `format:
 * "json"` here only guarantees strict JSON, not a domain interface.
 */
export const POST: RequestHandler = async ({ request }) => {
	let payload: unknown;

	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Body must be valid JSON.' }, { status: 400 });
	}

	const parsed = askSchema.safeParse(payload);

	if (!parsed.success) {
		return json({ error: 'Invalid AI request.', issues: parsed.error.issues }, { status: 400 });
	}

	const input = parsed.data;
	let events: AsyncIterable<AiEvent>;

	try {
		const ai = getAiModule();
		const options = {
			message: input.message,
			history: input.history,
			rules: input.rules,
			temperature: input.temperature,
			maxTokens: input.maxTokens
		};

		events =
			input.format === 'json'
				? ai.streamAskJson({ ...options, schema: z.json() })
				: ai.streamAsk(options);
	} catch (cause) {
		if (cause instanceof AiConfigurationError) {
			return json({ error: cause.message, code: cause.code }, { status: 503 });
		}

		return json({ error: 'AI is unavailable.' }, { status: 503 });
	}

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
