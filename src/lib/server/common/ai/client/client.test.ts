import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import type { AiEvent } from '#lib/ai/types.ts';
import { AiAbortedError, AiExhaustedError } from '../errors';
import { HONESTY_RULES, JSON_CONTRACT } from '../prompt';
import { geminiText, jsonResponse, openAiText, recordingFetch } from '../testing/helpers';
import type { AiClientOptions } from '../types';
import { AiClient } from './index';

const GROQ = { provider: 'groq' as const, model: 'gpt-test' };
const GEMINI = { provider: 'gemini' as const, model: 'gemini-test' };
const OPENROUTER = { provider: 'openrouter' as const, model: 'openrouter-test' };

const RATING_SCHEMA = z.object({ rating: z.number().int().min(0).max(10) });

function clientFor(
	fetch: ReturnType<typeof recordingFetch>['fetch'],
	overrides: Partial<AiClientOptions> = {}
): AiClient {
	return new AiClient({
		chain: [GROQ],
		apiKeys: { groq: 'key' },
		fetch,
		...overrides
	});
}

describe('AiClient.ask', () => {
	test('returns the first successful answer and forwards rules and history', async () => {
		const recorded = recordingFetch(() => jsonResponse(openAiText('hello')));
		const client = clientFor(recorded.fetch);
		const events: AiEvent[] = [];

		const result = await client.ask({
			message: 'current',
			history: [
				{ role: 'user', content: 'earlier question' },
				{ role: 'assistant', content: 'earlier answer' }
			],
			rules: ['rule one', 'rule two'],
			onEvent: (event) => events.push(event)
		});

		expect(result.text).toBe('hello');
		expect(result.provider).toBe('groq');
		expect(result.attempts).toHaveLength(1);

		const body = recorded.calls[0].body as { messages: { role: string; content: string }[] };

		expect(body.messages[0]).toEqual({ role: 'system', content: 'rule one\n\nrule two' });
		expect(body.messages.slice(1)).toEqual([
			{ role: 'user', content: 'earlier question' },
			{ role: 'assistant', content: 'earlier answer' },
			{ role: 'user', content: 'current' }
		]);
		expect(events.map((event) => event.type)).toEqual(['attempt', 'success']);
	});

	test('falls back to the next model on a provider error', async () => {
		const recorded = recordingFetch((_call, index) =>
			index === 0
				? jsonResponse({ error: { message: 'upstream down' } }, { status: 500 })
				: jsonResponse(geminiText('from gemini'))
		);
		const client = clientFor(recorded.fetch, {
			chain: [GROQ, GEMINI],
			apiKeys: { groq: 'key', gemini: 'key' }
		});
		const events: AiEvent[] = [];

		const result = await client.ask({ message: 'hi', onEvent: (event) => events.push(event) });

		expect(result.provider).toBe('gemini');
		expect(result.text).toBe('from gemini');
		expect(result.attempts.map((attempt) => attempt.outcome)).toEqual(['failure', 'success']);
		expect(events.map((event) => event.type)).toEqual([
			'attempt',
			'failure',
			'fallback',
			'attempt',
			'success'
		]);
	});

	test('skips a provider that has no API key', async () => {
		const recorded = recordingFetch(() => jsonResponse(geminiText('ok')));
		const client = clientFor(recorded.fetch, {
			chain: [GROQ, GEMINI],
			apiKeys: { gemini: 'key' }
		});
		const events: AiEvent[] = [];

		const result = await client.ask({ message: 'hi', onEvent: (event) => events.push(event) });

		expect(result.provider).toBe('gemini');
		expect(recorded.calls).toHaveLength(1);
		expect(events.map((event) => event.type)).toEqual([
			'failure',
			'fallback',
			'attempt',
			'success'
		]);
		expect(events[0]).toMatchObject({
			type: 'failure',
			attempt: { provider: 'groq', errorCode: 'configuration' }
		});
	});

	test('throws AiExhaustedError after every model fails', async () => {
		const recorded = recordingFetch(() =>
			jsonResponse({ error: { message: 'down' } }, { status: 503 })
		);
		const client = clientFor(recorded.fetch, {
			chain: [GROQ, GEMINI],
			apiKeys: { groq: 'key', gemini: 'key' }
		});
		const events: AiEvent[] = [];

		await expect(
			client.ask({ message: 'hi', onEvent: (event) => events.push(event) })
		).rejects.toBeInstanceOf(AiExhaustedError);

		expect(events.map((event) => event.type)).toEqual([
			'attempt',
			'failure',
			'fallback',
			'attempt',
			'failure',
			'exhausted'
		]);
	});

	test('does not call a provider with an already-aborted signal', async () => {
		const recorded = recordingFetch(() => jsonResponse(openAiText('unused')));
		const client = clientFor(recorded.fetch);
		const controller = new AbortController();

		controller.abort();

		await expect(client.ask({ message: 'hi', signal: controller.signal })).rejects.toBeInstanceOf(
			AiAbortedError
		);
		expect(recorded.calls).toHaveLength(0);
	});
});

describe('AiClient.askJson', () => {
	test('adds honesty and JSON rules and returns a schema-validated value', async () => {
		const recorded = recordingFetch(() => jsonResponse(openAiText('```json\n{"rating":7}\n```')));
		const client = clientFor(recorded.fetch);

		const result = await client.askJson({
			message: 'judge',
			rules: 'Use the 0-10 rubric.',
			schema: RATING_SCHEMA
		});

		expect(result.value).toEqual({ rating: 7 });

		const body = recorded.calls[0].body as { messages: { role: string; content: string }[] };
		const system = body.messages[0].content;

		expect(system).toContain('Use the 0-10 rubric.');
		expect(system).toContain(HONESTY_RULES);
		expect(system).toContain(JSON_CONTRACT);
	});

	test('repairs invalid JSON once on the same model', async () => {
		const recorded = recordingFetch((_call, index) =>
			jsonResponse(openAiText(index === 0 ? 'not json' : '{"rating":3}'))
		);
		const client = clientFor(recorded.fetch);
		const events: AiEvent[] = [];

		const result = await client.askJson({
			message: 'judge',
			schema: RATING_SCHEMA,
			onEvent: (event) => events.push(event)
		});

		expect(result.value).toEqual({ rating: 3 });
		expect(recorded.calls).toHaveLength(2);
		expect(events.map((event) => event.type)).toEqual([
			'attempt',
			'failure',
			'repair',
			'attempt',
			'success'
		]);

		const secondBody = recorded.calls[1].body as {
			messages: { role: string; content: string }[];
		};
		const assistant = secondBody.messages.find((message) => message.role === 'assistant');

		expect(assistant?.content).toBe('not json');
		expect(secondBody.messages.at(-1)?.content).toContain('previous response was rejected');
	});

	test('repairs a schema mismatch', async () => {
		const recorded = recordingFetch((_call, index) =>
			jsonResponse(openAiText(index === 0 ? '{"rating":"high"}' : '{"rating":4}'))
		);
		const client = clientFor(recorded.fetch);

		const result = await client.askJson({ message: 'judge', schema: RATING_SCHEMA });

		expect(result.value).toEqual({ rating: 4 });
		expect(recorded.calls).toHaveLength(2);
	});

	test('repairs when a semantic check fails', async () => {
		const recorded = recordingFetch((_call, index) =>
			jsonResponse(openAiText(index === 0 ? '{"rating":4}' : '{"rating":5}'))
		);
		const client = clientFor(recorded.fetch);
		const events: AiEvent[] = [];

		const result = await client.askJson({
			message: 'judge',
			schema: RATING_SCHEMA,
			checks: (value) => (value.rating === 5 ? [] : ['rating must be 5']),
			onEvent: (event) => events.push(event)
		});

		expect(result.value).toEqual({ rating: 5 });

		const repairs = events.filter((event) => event.type === 'repair');

		expect(repairs).toHaveLength(1);
		expect(repairs[0]).toMatchObject({ problems: ['rating must be 5'] });
	});

	test('falls back to the next model after repairs are exhausted', async () => {
		const recorded = recordingFetch((_call, index) => {
			if (index < 2) return jsonResponse(openAiText('still not json'));

			return jsonResponse(geminiText('{"rating":9}'));
		});
		const client = clientFor(recorded.fetch, {
			chain: [GROQ, GEMINI],
			apiKeys: { groq: 'key', gemini: 'key' }
		});

		const result = await client.askJson({ message: 'judge', schema: RATING_SCHEMA });

		expect(result.provider).toBe('gemini');
		expect(result.value).toEqual({ rating: 9 });
		expect(recorded.calls).toHaveLength(3);
	});

	test('rejects prose around JSON instead of trusting it', async () => {
		const recorded = recordingFetch(() =>
			jsonResponse(openAiText('The rating is 7. {"rating":7}'))
		);
		const client = clientFor(recorded.fetch, { maxRepairAttempts: 0 });

		await expect(
			client.askJson({ message: 'judge', schema: RATING_SCHEMA })
		).rejects.toBeInstanceOf(AiExhaustedError);
	});
});

describe('AiClient validation', () => {
	test('rejects an empty message before calling a provider', async () => {
		const recorded = recordingFetch(() => jsonResponse(openAiText('unused')));
		const client = clientFor(recorded.fetch);

		await expect(client.ask({ message: '  ' })).rejects.toThrow('"message"');
		expect(recorded.calls).toHaveLength(0);
	});

	test('rejects an empty fallback chain', async () => {
		const recorded = recordingFetch(() => jsonResponse(openAiText('unused')));
		const client = clientFor(recorded.fetch, { chain: [] });

		await expect(client.ask({ message: 'hi' })).rejects.toThrow('chain is empty');
	});

	test('uses an explicit chain override', async () => {
		const recorded = recordingFetch(() => jsonResponse(openAiText('ok')));
		const client = clientFor(recorded.fetch, {
			chain: [GROQ],
			apiKeys: { groq: 'key', openrouter: 'key' }
		});

		await client.ask({ message: 'hi', models: [OPENROUTER] });

		expect(recorded.calls[0].url).toContain('openrouter.ai');
	});
});
