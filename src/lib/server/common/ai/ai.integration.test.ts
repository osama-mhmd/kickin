import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { config } from '../../config';
import { getAiModule, setAiModule } from './index';

const hasProviderKey = Boolean(config.groqApiKey || config.geminiApiKey || config.openrouterApiKey);
const enabled = process.env.AI_INTEGRATION === '1' && hasProviderKey;
const suite = enabled ? describe : describe.skip;

suite('AI module against real providers', () => {
	test(
		'ask returns text from the first working free model',
		{ retry: 1, timeout: 90_000 },
		async () => {
			const result = await getAiModule().ask({
				message: 'Reply with the single word: pong',
				temperature: 0,
				maxTokens: 50
			});

			expect(result.text.toLowerCase()).toContain('pong');
			expect(result.attempts.at(-1)?.outcome).toBe('success');
		}
	);

	test(
		'askJson returns a value validated by the caller schema',
		{ retry: 1, timeout: 90_000 },
		async () => {
			const result = await getAiModule().askJson({
				message: 'Return a JSON object with one field "answer" whose value is "pong".',
				schema: z.object({ answer: z.string() }),
				temperature: 0,
				maxTokens: 100
			});

			expect(result.value.answer.toLowerCase()).toContain('pong');
		}
	);

	test('streamAsk emits a terminal success event', { retry: 1, timeout: 90_000 }, async () => {
		setAiModule(undefined);

		const types: string[] = [];

		for await (const event of getAiModule().streamAsk({
			message: 'Reply with the single word: pong',
			temperature: 0,
			maxTokens: 50
		})) {
			types.push(event.type);
		}

		expect(types.at(0)).toBe('attempt');
		expect(types.at(-1)).toBe('success');
	});
});
