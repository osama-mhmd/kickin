import { describe, expect, test } from 'vitest';
import type { AiEvent } from '#lib/ai/types.ts';
import { createAiEventStream, formatAiEvent } from './index';

const ATTEMPT: AiEvent = {
	type: 'attempt',
	number: 1,
	provider: 'groq',
	model: 'model-test',
	phase: 'request'
};

const SUCCESS: AiEvent = {
	type: 'success',
	attempt: {
		number: 1,
		provider: 'groq',
		model: 'model-test',
		outcome: 'success',
		latencyMs: 10
	}
};

const EXHAUSTED: AiEvent = {
	type: 'exhausted',
	message: 'all failed',
	attempts: []
};

describe('formatAiEvent', () => {
	test('writes a named SSE event with JSON data', () => {
		expect(formatAiEvent(ATTEMPT)).toBe(`event: attempt\ndata: ${JSON.stringify(ATTEMPT)}\n\n`);
	});
});

describe('createAiEventStream', () => {
	test('stops at a terminal success event', async () => {
		async function* events(): AsyncGenerator<AiEvent> {
			yield ATTEMPT;
			yield SUCCESS;
			throw new Error('the adapter must not read past success');
		}

		const text = await new Response(createAiEventStream(events(), { heartbeatMs: 60_000 })).text();

		expect(text).toContain('event: attempt');
		expect(text).toContain('event: success');
		expect(text).not.toContain('must not read');
	});

	test('stops at an exhausted event instead of surfacing the throw', async () => {
		async function* events(): AsyncGenerator<AiEvent> {
			yield ATTEMPT;
			yield EXHAUSTED;
			throw new Error('exhausted is terminal');
		}

		const text = await new Response(createAiEventStream(events(), { heartbeatMs: 60_000 })).text();

		expect(text).toContain('event: exhausted');
		expect(text).not.toContain('is terminal');
	});
});
