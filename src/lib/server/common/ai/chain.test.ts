import { describe, expect, test } from 'vitest';
import { AiConfigurationError } from './errors';
import { defaultAiChain, parseAiChain } from './chain';

describe('parseAiChain', () => {
	test('returns a copy of the default chain when no override is set', () => {
		const chain = parseAiChain(undefined);

		expect(chain).toEqual(defaultAiChain.map((entry) => ({ ...entry })));
		expect(chain).not.toBe(defaultAiChain);
	});

	test('parses and validates a JSON chain', () => {
		const chain = parseAiChain(
			'[{"provider":"groq","model":"openai/gpt-oss-120b","rpm":30,"maxTokens":4096}]'
		);

		expect(chain).toEqual([
			{ provider: 'groq', model: 'openai/gpt-oss-120b', rpm: 30, maxTokens: 4096 }
		]);
	});

	test('rejects malformed JSON and invalid entries', () => {
		expect(() => parseAiChain('not json')).toThrow(AiConfigurationError);
		expect(() => parseAiChain('[]')).toThrow(AiConfigurationError);
		expect(() => parseAiChain('[{"provider":"openai","model":"x"}]')).toThrow(AiConfigurationError);
		expect(() => parseAiChain('[{"provider":"groq","model":""}]')).toThrow(AiConfigurationError);
	});
});
