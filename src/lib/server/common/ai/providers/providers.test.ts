import { describe, expect, test } from 'vitest';
import { AiInvalidResponseError, AiRateLimitError } from '../errors';
import { geminiText, jsonResponse, openAiText, recordingFetch } from '../testing/helpers';
import type { ProviderRequest } from '../types';
import { callProvider } from './index';

function request(
	overrides: Partial<ProviderRequest>,
	fetch: ProviderRequest['fetch']
): ProviderRequest {
	return {
		provider: 'groq',
		model: 'model-test',
		apiKey: 'secret',
		messages: [{ role: 'user', content: 'hello' }],
		temperature: 0,
		timeoutMs: 1_000,
		fetch,
		...overrides
	};
}

describe('callProvider: OpenAI-compatible transports', () => {
	test('posts a chat completion to Groq with bearer auth', async () => {
		const recorded = recordingFetch(() => jsonResponse(openAiText('answer')));
		const response = await callProvider(
			request({ provider: 'groq', maxTokens: 128 }, recorded.fetch)
		);

		expect(response.text).toBe('answer');
		expect(response.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
		expect(recorded.calls[0].url).toBe('https://api.groq.com/openai/v1/chat/completions');
		expect(recorded.calls[0].body).toMatchObject({
			model: 'model-test',
			temperature: 0,
			max_tokens: 128,
			stream: false
		});
		expect(new Headers(recorded.calls[0].init?.headers).get('authorization')).toBe('Bearer secret');
	});

	test('posts a chat completion to OpenRouter', async () => {
		const recorded = recordingFetch(() => jsonResponse(openAiText('answer')));

		await callProvider(request({ provider: 'openrouter' }, recorded.fetch));

		expect(recorded.calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
	});

	test('accepts array content parts', async () => {
		const recorded = recordingFetch(() =>
			jsonResponse({ choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }] })
		);
		const response = await callProvider(request({}, recorded.fetch));

		expect(response.text).toBe('ab');
	});

	test('maps rate limits with a reset time', async () => {
		const recorded = recordingFetch(() =>
			jsonResponse(
				{ error: { message: 'rate limit exceeded' } },
				{ status: 429, headers: { 'retry-after': '30' } }
			)
		);

		const error = await callProvider(request({}, recorded.fetch)).catch((cause: unknown) => cause);

		expect(error).toBeInstanceOf(AiRateLimitError);
		expect(error).toMatchObject({
			provider: 'groq',
			model: 'model-test',
			status: 429,
			code: 'rate_limit'
		});
		expect((error as AiRateLimitError).resetAt).toBeInstanceOf(Date);
	});

	test('rejects an unexpected response shape', async () => {
		const recorded = recordingFetch(() => jsonResponse({ choices: [] }));

		await expect(callProvider(request({}, recorded.fetch))).rejects.toBeInstanceOf(
			AiInvalidResponseError
		);
	});
});

describe('callProvider: Gemini', () => {
	test('uses x-goog-api-key, converts roles, and merges adjacent turns', async () => {
		const recorded = recordingFetch(() => jsonResponse(geminiText('answer')));
		const response = await callProvider(
			request(
				{
					provider: 'gemini',
					model: 'gemini-2.5-flash',
					messages: [
						{ role: 'system', content: 'rules' },
						{ role: 'user', content: 'hello' },
						{ role: 'user', content: 'again' },
						{ role: 'assistant', content: 'previous' },
						{ role: 'user', content: 'final' }
					]
				},
				recorded.fetch
			)
		);

		expect(response.text).toBe('answer');

		const call = recorded.calls[0];

		expect(call.url).toContain('/models/gemini-2.5-flash:generateContent');
		expect(new Headers(call.init?.headers).get('x-goog-api-key')).toBe('secret');
		expect(call.body).toMatchObject({
			systemInstruction: { parts: [{ text: 'rules' }] },
			contents: [
				{ role: 'user', parts: [{ text: 'hello' }, { text: 'again' }] },
				{ role: 'model', parts: [{ text: 'previous' }] },
				{ role: 'user', parts: [{ text: 'final' }] }
			],
			generationConfig: { temperature: 0 }
		});
	});

	test('ignores thought parts and rejects a blocked prompt', async () => {
		const recorded = recordingFetch(() =>
			jsonResponse({
				candidates: [
					{ content: { parts: [{ text: 'hidden', thought: true }, { text: 'visible' }] } }
				]
			})
		);
		const response = await callProvider(request({ provider: 'gemini' }, recorded.fetch));

		expect(response.text).toBe('visible');

		const blocked = recordingFetch(() =>
			jsonResponse({ candidates: [], promptFeedback: { blockReason: 'SAFETY' } })
		);

		await expect(
			callProvider(request({ provider: 'gemini' }, blocked.fetch))
		).rejects.toBeInstanceOf(AiInvalidResponseError);
	});
});
